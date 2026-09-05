/**
 * Newest-first cover backfill. Reuses generateSongCover (no second pipeline).
 * Fail-soft per song. Safe to re-run: ready no-ops; poster_ready is Luma-only.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, isFirebaseAdminConfigured } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type { CoverJobResult } from './generate';
import { generateSongCover } from './generate';
import {
  getCoverBackfillBatchSize,
  getCoverBackfillConcurrency,
  getCoverBackfillScanLimit,
} from './config';
import type { SongDocument } from '@/types/firestore';

export interface BackfillCursor {
  createdAtMs: number;
  songId: string;
}

export interface BackfillRunOptions {
  cursor?: BackfillCursor | null;
  batchSize?: number;
  concurrency?: number;
  scanLimit?: number;
  dryRun?: boolean;
}

export interface BackfillRunResult {
  ok: boolean;
  dryRun?: boolean;
  scanned: number;
  selected: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  concurrency: number;
  batchSize: number;
  results: CoverJobResult[];
  nextCursor: string | null;
  exhausted: boolean;
  reason?: string;
}

const SCAN_PAGE_SIZE = 50;

export function encodeBackfillCursor(cursor: BackfillCursor): string {
  return `${cursor.createdAtMs}:${cursor.songId}`;
}

export function decodeBackfillCursor(raw?: string | null): BackfillCursor | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const sep = trimmed.indexOf(':');
  if (sep <= 0) return null;
  const createdAtMs = Number(trimmed.slice(0, sep));
  const songId = trimmed.slice(sep + 1).trim();
  if (!Number.isFinite(createdAtMs) || !songId) return null;
  return { createdAtMs, songId };
}

function timestampMs(value: unknown): number {
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof (value as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

/**
 * Same skip rule as generateSongCover: deleted songs and fully ready
 * covers (poster + loop) are left alone. poster_ready / failed / missing
 * poster still need work (Luma-only when a poster URL already exists).
 */
export function songNeedsCoverBackfill(song: {
  deletedAt?: unknown;
  coverMotionStatus?: SongDocument['coverMotionStatus'];
  coverPosterUrl?: string | null;
  coverVideoUrl?: string | null;
}): boolean {
  if (song.deletedAt) return false;
  const poster = song.coverPosterUrl?.trim();
  const video = song.coverVideoUrl?.trim();
  if (song.coverMotionStatus === 'ready' && poster && video) {
    return false;
  }
  return true;
}

function comesAfterCursor(
  createdAtMs: number,
  songId: string,
  cursor: BackfillCursor
): boolean {
  if (createdAtMs < cursor.createdAtMs) return true;
  if (createdAtMs > cursor.createdAtMs) return false;
  return songId < cursor.songId;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  }

  const workers = Math.min(Math.max(concurrency, 1), items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

interface ScannedSong {
  id: string;
  createdAtMs: number;
}

async function collectBackfillCandidates(options: {
  cursor: BackfillCursor | null;
  batchSize: number;
  scanLimit: number;
}): Promise<{
  candidates: ScannedSong[];
  scanned: number;
  lastScanned: BackfillCursor | null;
  exhausted: boolean;
}> {
  const db = getAdminDb();
  const candidates: ScannedSong[] = [];
  let scanned = 0;
  let lastScanned: BackfillCursor | null = options.cursor;
  let exhausted = false;
  let pageStart: BackfillCursor | null = options.cursor;

  while (candidates.length < options.batchSize && scanned < options.scanLimit && !exhausted) {
    const remainingScan = options.scanLimit - scanned;
    const pageSize = Math.min(SCAN_PAGE_SIZE, remainingScan);
    let query = db
      .collection(COLLECTIONS.songs)
      .orderBy('createdAt', 'desc')
      .limit(pageSize);

    if (pageStart) {
      query = query.startAt(Timestamp.fromMillis(pageStart.createdAtMs));
    }

    const snap = await query.get();
    if (snap.empty) {
      exhausted = true;
      break;
    }

    const page = snap.docs
      .map(docSnap => {
        const data = (docSnap.data() || {}) as SongDocument;
        return {
          id: docSnap.id,
          createdAtMs: timestampMs(data.createdAt),
          song: data,
        };
      })
      .sort((a, b) => {
        if (b.createdAtMs !== a.createdAtMs) return b.createdAtMs - a.createdAtMs;
        return b.id.localeCompare(a.id);
      });

    let advanced = 0;
    for (const row of page) {
      if (pageStart && !comesAfterCursor(row.createdAtMs, row.id, pageStart)) {
        continue;
      }
      advanced += 1;
      scanned += 1;
      lastScanned = { createdAtMs: row.createdAtMs, songId: row.id };
      if (songNeedsCoverBackfill(row.song)) {
        candidates.push({ id: row.id, createdAtMs: row.createdAtMs });
      }
      if (candidates.length >= options.batchSize || scanned >= options.scanLimit) {
        break;
      }
    }

    if (snap.docs.length < pageSize) {
      exhausted = true;
    } else if (advanced === 0) {
      // Same createdAt page as the cursor; step past this timestamp.
      pageStart = {
        createdAtMs: pageStart ? pageStart.createdAtMs - 1 : 0,
        songId: '\uFFFF',
      };
    } else {
      pageStart = lastScanned;
    }
  }

  return { candidates, scanned, lastScanned, exhausted };
}

/**
 * Scan newest songs first (createdAt desc; updatedAt is not used — the
 * generate job writes updatedAt, which would reshuffle the cursor).
 */
export async function runCoverBackfill(
  options: BackfillRunOptions = {}
): Promise<BackfillRunResult> {
  const batchSize = options.batchSize ?? getCoverBackfillBatchSize();
  const concurrency = options.concurrency ?? getCoverBackfillConcurrency();
  const scanLimit = options.scanLimit ?? getCoverBackfillScanLimit();

  if (!isFirebaseAdminConfigured()) {
    return {
      ok: false,
      scanned: 0,
      selected: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      concurrency,
      batchSize,
      results: [],
      nextCursor: options.cursor ? encodeBackfillCursor(options.cursor) : null,
      exhausted: false,
      reason: 'Firebase Admin is not initialized',
    };
  }

  const { candidates, scanned, lastScanned, exhausted } = await collectBackfillCandidates({
    cursor: options.cursor ?? null,
    batchSize,
    scanLimit,
  });

  const nextCursor = lastScanned ? encodeBackfillCursor(lastScanned) : null;

  if (options.dryRun) {
    return {
      ok: true,
      dryRun: true,
      scanned,
      selected: candidates.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: candidates.length,
      concurrency,
      batchSize,
      results: candidates.map(song => ({
        ok: true,
        skipped: true,
        reason: 'dryRun',
        songId: song.id,
      })),
      nextCursor,
      exhausted,
    };
  }

  const results = await mapPool(candidates, concurrency, async song => {
    try {
      return await generateSongCover(song.id);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Cover backfill failed';
      console.error('[cover] backfill song failed', song.id, reason);
      return { ok: false, songId: song.id, reason };
    }
  });

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  for (const result of results) {
    if (result.skipped) skipped += 1;
    else if (result.ok) succeeded += 1;
    else failed += 1;
  }

  return {
    ok: failed === 0,
    scanned,
    selected: candidates.length,
    processed: results.length,
    succeeded,
    failed,
    skipped,
    concurrency,
    batchSize,
    results,
    nextCursor,
    exhausted,
  };
}
