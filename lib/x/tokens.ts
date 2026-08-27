/**
 * Server-only X OAuth token storage.
 * Collection: artistXAuth/{artistId} — Admin SDK only, never sent to the client.
 */

import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type { XTokenSet } from './oauth';

export interface StoredXAuth extends XTokenSet {
  artistId: string;
  ownerId: string;
  updatedAtMs: number;
}

export async function saveXAuth(input: {
  artistId: string;
  ownerId: string;
  tokens: XTokenSet;
}): Promise<void> {
  const db = getAdminDb();
  await db.collection(COLLECTIONS.artistXAuth).doc(input.artistId).set({
    artistId: input.artistId,
    ownerId: input.ownerId,
    accessToken: input.tokens.accessToken,
    refreshToken: input.tokens.refreshToken,
    accessTokenExpiresAt: input.tokens.accessTokenExpiresAt,
    tokenType: input.tokens.tokenType,
    scope: input.tokens.scope,
    updatedAtMs: Date.now(),
  });
}

export async function loadXAuth(artistId: string): Promise<StoredXAuth | null> {
  const db = getAdminDb();
  const snap = await db.collection(COLLECTIONS.artistXAuth).doc(artistId).get();
  if (!snap.exists) return null;
  const data = snap.data() as StoredXAuth | undefined;
  if (!data?.accessToken) return null;
  return data;
}

export async function deleteXAuth(artistId: string): Promise<void> {
  const db = getAdminDb();
  await db.collection(COLLECTIONS.artistXAuth).doc(artistId).delete();
}
