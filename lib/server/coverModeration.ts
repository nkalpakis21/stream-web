/**
 * Screen a song cover and record coverModeration on the song doc.
 * Vision failures store status `error` and do not throw.
 * Retry is idempotent: only `error` and `pending` are checked again.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { isFalCoverPipeline } from '@/lib/covers/config';
import {
  coverModerationRetryable,
  isCoverModerationEnabled,
  readCoverModerationStatus,
  safeSearchDecision,
  type CoverModerationStatus,
  type SafeSearchLabels,
} from '@/lib/covers/moderation';
import { resolveCoverPoster } from '@/lib/covers/resolve';
import { updateSongCoverFields } from '@/lib/covers/store';
import { adminGetSong } from '@/lib/server/songsAdmin';
import { annotateSafeSearch } from '@/lib/server/coverVision';
import { firestoreNow } from '@/lib/x/artistStore';
import type { CoverModeration, SongDocument } from '@/types/firestore';

export interface CoverModerationSong {
  id: string;
  deletedAt?: unknown;
  coverPosterUrl?: string | null;
  coverVideoUrl?: string | null;
  coverMotionStatus?: SongDocument['coverMotionStatus'];
  albumCoverPath?: string | null;
  albumCoverThumbnail?: string | null;
  coverModeration?: { status?: unknown } | null;
}

export interface CoverModerationRecord {
  status: CoverModerationStatus;
  checkedAt: number;
  labels: { adult: string; violence: string; racy: string } | null;
}

export type CoverModerationRun = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  status?: CoverModerationStatus;
};

export interface CoverModerationDeps {
  enabled: boolean;
  now: () => number;
  loadSong: (songId: string) => Promise<CoverModerationSong | null>;
  saveModeration: (songId: string, record: CoverModerationRecord) => Promise<void>;
  clearCover: (songId: string) => Promise<void>;
  annotate: (imageUrl: string) => Promise<SafeSearchLabels>;
  falReplaceAvailable: () => boolean;
}

function clipLabel(value: string | null | undefined): string {
  return typeof value === 'string' ? value : '';
}

function toStored(record: CoverModerationRecord): CoverModeration {
  return {
    status: record.status,
    checkedAt: Timestamp.fromMillis(record.checkedAt) as unknown as CoverModeration['checkedAt'],
    labels: record.labels,
  };
}

async function loadSongDefault(songId: string): Promise<CoverModerationSong | null> {
  const song = await adminGetSong(songId);
  if (!song) return null;
  return { ...song, id: song.id || songId };
}

async function saveModerationDefault(songId: string, record: CoverModerationRecord): Promise<void> {
  await updateSongCoverFields(songId, { coverModeration: toStored(record) });
}

async function clearCoverDefault(songId: string): Promise<void> {
  await updateSongCoverFields(songId, {
    coverPosterUrl: null,
    coverVideoUrl: null,
    coverMotionStatus: 'pending',
    coverMotionError: null,
    coverModeration: {
      status: 'pending',
      checkedAt: firestoreNow(),
      labels: null,
    },
  });
}

export function coverModerationDeps(overrides?: Partial<CoverModerationDeps>): CoverModerationDeps {
  return {
    enabled: overrides?.enabled ?? isCoverModerationEnabled(),
    now: overrides?.now ?? (() => Date.now()),
    loadSong: overrides?.loadSong ?? loadSongDefault,
    saveModeration: overrides?.saveModeration ?? saveModerationDefault,
    clearCover: overrides?.clearCover ?? clearCoverDefault,
    annotate: overrides?.annotate ?? annotateSafeSearch,
    falReplaceAvailable:
      overrides?.falReplaceAvailable ??
      (() => isFalCoverPipeline() && Boolean(process.env.FAL_KEY?.trim())),
  };
}

/** Pending mark written in the same update as a new cover URL. */
export function pendingCoverModeration(): CoverModeration {
  return { status: 'pending', checkedAt: firestoreNow(), labels: null };
}

async function saveError(
  deps: CoverModerationDeps,
  songId: string,
  checkedAt: number
): Promise<void> {
  try {
    await deps.saveModeration(songId, { status: 'error', checkedAt, labels: null });
  } catch (error) {
    console.error(
      '[cover-moderation] could not store error status',
      songId,
      error instanceof Error ? error.message : 'error'
    );
  }
}

async function runScreen(song: CoverModerationSong, deps: CoverModerationDeps): Promise<CoverModerationRun> {
  const checkedAt = deps.now();
  const url = resolveCoverPoster(song);
  if (!url) {
    await saveError(deps, song.id, checkedAt);
    return { ok: false, status: 'error', reason: 'no_image' };
  }
  try {
    const labels = await deps.annotate(url);
    const status = safeSearchDecision(labels);
    await deps.saveModeration(song.id, {
      status,
      checkedAt,
      labels: {
        adult: clipLabel(labels.adult),
        violence: clipLabel(labels.violence),
        racy: clipLabel(labels.racy),
      },
    });
    return { ok: true, status };
  } catch (error) {
    console.error(
      '[cover-moderation] check failed',
      song.id,
      error instanceof Error ? error.message : 'error'
    );
    await saveError(deps, song.id, checkedAt);
    return { ok: false, status: 'error', reason: 'vision_failed' };
  }
}

/**
 * Screen the cover currently stored on the song.
 * No-ops when moderation is off (no Vision call, no write).
 * Never throws.
 */
export async function screenSongCover(
  songId: string,
  overrides?: Partial<CoverModerationDeps>
): Promise<CoverModerationRun> {
  const deps = coverModerationDeps(overrides);
  if (!deps.enabled) {
    return { ok: true, skipped: true, reason: 'disabled' };
  }
  try {
    const song = await deps.loadSong(songId);
    if (!song || song.deletedAt) {
      return { ok: false, reason: 'not_found' };
    }
    return await runScreen({ ...song, id: song.id || songId }, deps);
  } catch (error) {
    console.error(
      '[cover-moderation] screen failed',
      songId,
      error instanceof Error ? error.message : 'error'
    );
    await saveError(deps, songId, deps.now());
    return { ok: false, status: 'error', reason: 'vision_failed' };
  }
}

/**
 * Re-run SafeSearch for a song whose status is `error` or `pending`.
 * Passed and flagged songs are left as they are.
 */
export async function retryCoverModeration(
  songId: string,
  overrides?: Partial<CoverModerationDeps>
): Promise<CoverModerationRun> {
  const deps = coverModerationDeps(overrides);
  if (!deps.enabled) {
    return { ok: true, skipped: true, reason: 'disabled' };
  }
  let song: CoverModerationSong | null;
  try {
    song = await deps.loadSong(songId);
  } catch (error) {
    console.error(
      '[cover-moderation] load failed',
      songId,
      error instanceof Error ? error.message : 'error'
    );
    return { ok: false, status: 'error', reason: 'load_failed' };
  }
  if (!song || song.deletedAt) {
    return { ok: false, reason: 'not_found' };
  }
  const status = readCoverModerationStatus(song);
  if (!coverModerationRetryable(status)) {
    return { ok: true, skipped: true, reason: 'not_retryable', status: status ?? undefined };
  }
  return runScreen({ ...song, id: song.id || songId }, deps);
}

/**
 * Clear the stored cover and mark it pending so the Fal job can write a new one.
 * Does nothing when moderation is off or Fal cannot generate a replacement.
 */
export async function prepareCoverReplacement(
  songId: string,
  overrides?: Partial<CoverModerationDeps>
): Promise<CoverModerationRun> {
  const deps = coverModerationDeps(overrides);
  if (!deps.enabled) {
    return { ok: true, skipped: true, reason: 'disabled' };
  }
  if (!deps.falReplaceAvailable()) {
    return { ok: false, reason: 'unavailable' };
  }
  try {
    const song = await deps.loadSong(songId);
    if (!song || song.deletedAt) {
      return { ok: false, reason: 'not_found' };
    }
    await deps.clearCover(song.id || songId);
    return { ok: true, status: 'pending' };
  } catch (error) {
    console.error(
      '[cover-moderation] replace failed',
      songId,
      error instanceof Error ? error.message : 'error'
    );
    await saveError(deps, songId, deps.now());
    return { ok: false, status: 'error', reason: 'replace_failed' };
  }
}
