/**
 * Sweep unverified artist coins. Does not use createdAt or MINT_SWEEP_START.
 * createdAt is a client clock and can be backdated.
 *
 * The cron query is every artist, ordered by document id. `deletedAt == null`
 * is not used: that comparison skips artists that have no `deletedAt` field.
 * An artist is skipped in memory only when `deletedAt` is set.
 *
 * `pumpFun.mint`, `pumpFun.verifiedAt`, `mintSweepExemptAt`, and
 * `mintFirstSeenAt` are filtered in memory. Firestore cannot match a field
 * that was never written.
 *
 * An artist with `mintSweepExemptAt` was stamped by scripts/mark-legacy-mints.ts
 * and is skipped. Everyone else with a mint and no verifiedAt is checked.
 * The first time the cron sees one, it writes root `mintFirstSeenAt` (server
 * timestamp) and does nothing else that run. A missing coinMints doc is
 * cleared only when that stamp is more than 30 minutes old. A binding for
 * another uid, or an on-chain creator that differs from
 * coinMints.creatorWallet, clears on the next run without waiting.
 * A missing bonding curve is left alone until mintFirstSeenAt is more
 * than 30 minutes old, then cleared as a mismatch.
 *
 * Each run checks at most MINT_VERIFY_BATCH_CAP artists. A document-id cursor
 * remembers how far the scan got. When the collection is exhausted the cursor
 * resets so the next run retries RPC failures from the start.
 */

import { timingSafeEqual } from 'crypto';
import { FieldPath, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { isMissingIndexError } from '@/lib/server/indexError';
import {
  MINT_UNBOUND_CLEAR_MS,
  hasVerifiedAt,
  inspectArtistMint,
  mintFromPump,
  verifyArtistMint,
  type MintCheckRow,
  type VerifyArtistMintDeps,
} from '@/lib/server/verifyArtistMint';

/** RPC checks and first-sighting stamps per cron run. */
export const MINT_VERIFY_BATCH_CAP = 10;
export const MINT_SWEEP_SCAN_CAP = 500;

const CURSOR_COLLECTION = 'config';
const CURSOR_ID = 'mintSweep';

export type MintSweepSummary = {
  ok: boolean;
  skipped: boolean;
  reason?: string;
  scanned: number;
  checked: number;
  matched: number;
  cleared: number;
  unchanged: number;
  /** First sighting stamped. Nothing else was done for that artist this run. */
  stamped: number;
  /** No coinMints doc, and mintFirstSeenAt is not yet 30 minutes old. */
  unbound: number;
};

export type MintSweepDeps = VerifyArtistMintDeps & {
  nowMs?: number;
  batchCap?: number;
  scanCap?: number;
};

type ArtistRecord = {
  ownerId?: unknown;
  name?: unknown;
  createdAt?: unknown;
  deletedAt?: unknown;
  pumpFun?: unknown;
  mintSweepExemptAt?: unknown;
  mintFirstSeenAt?: unknown;
};

type SweepDoc = { id: string; data: () => ArtistRecord | undefined };

function bearerSecretsMatch(provided: string, secret: string): boolean {
  const providedBuf = Buffer.from(provided);
  const secretBuf = Buffer.from(secret);
  if (providedBuf.length !== secretBuf.length) {
    timingSafeEqual(secretBuf, secretBuf);
    return false;
  }
  return timingSafeEqual(providedBuf, secretBuf);
}

export function isMintSweepAuthorized(request: {
  headers: { get(name: string): string | null };
}): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(\S+)\s*$/i);
  const bearer = match?.[1] ?? '';
  if (!bearer) {
    timingSafeEqual(Buffer.from(secret), Buffer.from(secret));
    return false;
  }
  return bearerSecretsMatch(bearer, secret);
}

export function timestampMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const record = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
  if (typeof record.toMillis === 'function') {
    const ms = record.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  const seconds = typeof record.seconds === 'number' ? record.seconds : record._seconds;
  if (typeof seconds === 'number' && Number.isFinite(seconds)) return Math.round(seconds * 1000);
  return null;
}

/** True when this artist still needs a mint check. createdAt is ignored. */
export function shouldSweepArtist(data: {
  deletedAt?: unknown;
  pumpFun?: unknown;
  mintSweepExemptAt?: unknown;
}): boolean {
  if (data.deletedAt) return false;
  if (data.mintSweepExemptAt != null) return false;
  if (!mintFromPump(data.pumpFun)) return false;
  if (hasVerifiedAt(data.pumpFun)) return false;
  return true;
}

function emptySummary(partial: Partial<MintSweepSummary>): MintSweepSummary {
  return {
    ok: true,
    skipped: false,
    scanned: 0,
    checked: 0,
    matched: 0,
    cleared: 0,
    unchanged: 0,
    stamped: 0,
    unbound: 0,
    ...partial,
  };
}

async function readCursor(db: Firestore): Promise<string | null> {
  const snap = await db.collection(CURSOR_COLLECTION).doc(CURSOR_ID).get();
  if (!snap.exists) return null;
  const data = snap.data() as { artistId?: unknown } | undefined;
  if (!data || typeof data.artistId !== 'string' || !data.artistId) return null;
  return data.artistId;
}

async function writeCursor(db: Firestore, artistId: string | null): Promise<void> {
  const ref = db.collection(CURSOR_COLLECTION).doc(CURSOR_ID);
  if (!artistId) {
    await ref.delete();
    return;
  }
  await ref.set({ artistId });
}

async function fetchSweepPage(
  db: Firestore,
  scanCap: number,
  cursor: string | null
): Promise<{ docs: SweepDoc[] }> {
  let query = db.collection(COLLECTIONS.artists).orderBy(FieldPath.documentId(), 'asc');
  if (cursor) query = query.startAfter(cursor);
  const snap = await query.limit(scanCap).get();
  return { docs: snap.docs as SweepDoc[] };
}

/**
 * Stamp mintFirstSeenAt once. Returns stamped when this run should stop
 * for the artist. A concurrent stamp is also treated as "not this run".
 */
async function stampMintFirstSeen(db: Firestore, artistId: string): Promise<'stamped' | 'absent'> {
  const ref = db.collection(COLLECTIONS.artists).doc(artistId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 'absent';
    const data = snap.data() as ArtistRecord | undefined;
    if (!data || !shouldSweepArtist(data)) return 'absent';
    if (data.mintFirstSeenAt != null) return 'stamped';
    tx.update(ref, {
      mintFirstSeenAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return 'stamped';
  });
}

export async function runMintSweep(deps: MintSweepDeps = {}): Promise<MintSweepSummary> {
  const nowMs = deps.nowMs ?? Date.now();
  const db = deps.db ?? getAdminDb();
  const batchCap = deps.batchCap ?? MINT_VERIFY_BATCH_CAP;
  const scanCap = deps.scanCap ?? MINT_SWEEP_SCAN_CAP;
  const summary = emptySummary({});

  let cursor: string | null = null;
  try {
    cursor = await readCursor(db);
  } catch (err) {
    console.error('[verify-mints] cursor read failed', err);
    cursor = null;
  }

  let page: { docs: SweepDoc[] };
  try {
    page = await fetchSweepPage(db, scanCap, cursor);
  } catch (err) {
    if (isMissingIndexError(err)) {
      console.error('[verify-mints] composite index missing');
      return emptySummary({ ok: false, reason: 'index' });
    }
    throw err;
  }

  if (page.docs.length === 0) {
    await writeCursor(db, null);
    return summary;
  }

  let cursorToSave: string | null = cursor;
  let stoppedEarly = false;

  for (const doc of page.docs) {
    const data = doc.data() ?? {};

    if (shouldSweepArtist(data)) {
      if (summary.checked >= batchCap) {
        stoppedEarly = true;
        break;
      }
      summary.checked += 1;

      const seenMs = timestampMillis(data.mintFirstSeenAt);
      if (data.mintFirstSeenAt == null || seenMs == null) {
        await stampMintFirstSeen(db, doc.id);
        summary.stamped += 1;
        summary.unchanged += 1;
      } else {
        const pastGrace = seenMs < nowMs - MINT_UNBOUND_CLEAR_MS;
        const outcome = await verifyArtistMint(doc.id, {
          db,
          lookupCreator: deps.lookupCreator,
          timeoutMs: deps.timeoutMs,
          unbound: pastGrace ? 'clear' : 'leave',
          missingCurve: pastGrace ? 'clear' : 'leave',
        });
        if (outcome.result === 'matched') summary.matched += 1;
        else if (outcome.result === 'cleared') summary.cleared += 1;
        else {
          summary.unchanged += 1;
          if (outcome.result === 'unbound') summary.unbound += 1;
        }
      }
    }

    summary.scanned += 1;
    cursorToSave = doc.id;
  }

  const reachedEnd = !stoppedEarly && page.docs.length < scanCap;
  await writeCursor(db, reachedEnd ? null : cursorToSave);
  return summary;
}

/**
 * Every artist coin. Never writes.
 * The caller prints the rows.
 */
export async function collectDryRunMintRows(deps: {
  db?: Firestore;
  lookupCreator?: VerifyArtistMintDeps['lookupCreator'];
  timeoutMs?: number;
  pageSize?: number;
}): Promise<MintCheckRow[]> {
  const db = deps.db ?? getAdminDb();
  const pageSize = deps.pageSize ?? 200;
  const rows: MintCheckRow[] = [];
  let cursor: string | null = null;

  for (;;) {
    let query = db.collection(COLLECTIONS.artists).orderBy(FieldPath.documentId(), 'asc');
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.limit(pageSize).get();
    if (snap.empty || snap.docs.length === 0) break;

    for (const doc of snap.docs as SweepDoc[]) {
      const data = doc.data() ?? {};
      cursor = doc.id;
      const mint = mintFromPump(data.pumpFun);
      if (!mint) continue;
      const ownerId = typeof data.ownerId === 'string' ? data.ownerId : '';
      const name = typeof data.name === 'string' ? data.name : '';
      rows.push(
        await inspectArtistMint(
          { artistId: doc.id, name, mint, ownerId },
          { db, lookupCreator: deps.lookupCreator, timeoutMs: deps.timeoutMs }
        )
      );
    }

    if (snap.docs.length < pageSize) break;
  }

  return rows;
}
