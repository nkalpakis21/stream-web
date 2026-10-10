/**
 * Remember a coin metadata id from POST /api/artists/pump-fun/metadata so a
 * later confirm that does not send the id (the iOS app) can still be linked.
 *
 * One doc per upload: coinMetadataUploads/{uid}/coinUploads/{id}.
 * expireAt is now + 24 hours. Firestore TTL on collection group `coinUploads`
 * deletes the doc. Confirm also skips an entry whose expireAt has passed,
 * in case TTL has not run yet. Admin SDK only.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { isValidPumpFunMetadataId } from '@/lib/solana/pumpFun';

export const COIN_METADATA_PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Subcollection under coinMetadataUploads/{uid}. TTL collection group name. */
export const COIN_METADATA_UPLOADS = 'coinUploads';

export type PendingCoinMetadata = {
  id: string;
  symbol: string;
  createdAtMs: number;
  expireAtMs: number;
};

function timestampMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const record = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
  if (typeof record.toMillis === 'function') {
    try {
      const ms = record.toMillis();
      return Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }
  const seconds = typeof record.seconds === 'number' ? record.seconds : record._seconds;
  if (typeof seconds === 'number' && Number.isFinite(seconds)) return Math.round(seconds * 1000);
  return null;
}

export function readPendingCoinMetadataUpload(
  id: string,
  data: unknown
): PendingCoinMetadata | null {
  if (!isValidPumpFunMetadataId(id)) return null;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const record = data as {
    symbol?: unknown;
    createdAt?: unknown;
    expireAt?: unknown;
  };
  if (typeof record.symbol !== 'string' || !record.symbol.trim()) return null;
  const createdAtMs = timestampMillis(record.createdAt);
  const expireAtMs = timestampMillis(record.expireAt);
  if (createdAtMs == null || expireAtMs == null) return null;
  return {
    id,
    symbol: record.symbol.trim(),
    createdAtMs,
    expireAtMs,
  };
}

/**
 * Newest upload whose symbol matches and whose expireAt is still in the
 * future. An entry at or before now is ignored. Several live uploads with
 * no symbol match return null so a different coin is not attached.
 */
export function selectPendingCoinMetadataId(
  items: readonly PendingCoinMetadata[],
  symbol: string,
  nowMs: number
): string | null {
  const wanted = symbol.trim();
  const live = items.filter(
    item => isValidPumpFunMetadataId(item.id) && item.expireAtMs > nowMs
  );
  const matches = live.filter(item => item.symbol === wanted);
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.createdAtMs - b.createdAtMs);
  return matches[matches.length - 1].id;
}

function uploadsRef(userId: string) {
  return getAdminDb()
    .collection(COLLECTIONS.coinMetadataUploads)
    .doc(userId)
    .collection(COIN_METADATA_UPLOADS);
}

export async function rememberCoinMetadataUpload(input: {
  userId: string;
  id: string;
  symbol: string;
  nowMs?: number;
}): Promise<void> {
  if (!isValidPumpFunMetadataId(input.id)) return;
  const symbol = input.symbol.trim();
  if (!symbol) return;
  const nowMs = input.nowMs ?? Date.now();
  await uploadsRef(input.userId).doc(input.id).set({
    symbol,
    createdAt: Timestamp.fromMillis(nowMs),
    expireAt: Timestamp.fromMillis(nowMs + COIN_METADATA_PENDING_MAX_AGE_MS),
  });
}

export async function findPendingCoinMetadataId(
  userId: string,
  symbol: string,
  nowMs: number = Date.now()
): Promise<string | null> {
  const snap = await uploadsRef(userId).get();
  const items: PendingCoinMetadata[] = [];
  for (const doc of snap.docs) {
    const item = readPendingCoinMetadataUpload(doc.id, doc.data());
    if (item) items.push(item);
  }
  return selectPendingCoinMetadataId(items, symbol, nowMs);
}

export async function forgetCoinMetadataUpload(userId: string, id: string): Promise<void> {
  await uploadsRef(userId).doc(id).delete();
}
