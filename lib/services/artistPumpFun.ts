/**
 * Owner-only persist of a confirmed pump.fun coin onto an existing artist.
 * Admin SDK so the write succeeds after the wallet-signed tx confirms.
 * Never writes empty pumpFun over a live mint.
 */

import { FieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { hasLaunchedCoin } from '@/lib/brand/coin';
import type { AIArtistDocument, PumpFunCoin } from '@/types/firestore';
import type { Timestamp } from 'firebase/firestore';

export class ArtistPumpFunPersistError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export type PersistArtistPumpFunInput = {
  artistId: string;
  userId: string;
  mint: string;
  url: string;
  symbol: string;
  launchedAtMs: number;
  creatorWallet: string;
};

export type PersistArtistPumpFunResult = {
  pumpFun: PumpFunCoin;
  noop: boolean;
};

function existingMint(pumpFun?: PumpFunCoin | null): string | null {
  const mint = pumpFun?.mint?.trim();
  return mint || null;
}

/**
 * Persist mint+url+symbol+launchedAt+creatorWallet on an existing artist.
 * Owner-only. No-ops when the same mint is already stored. Rejects when a
 * different mint exists. Never writes empty pumpFun over a live coin.
 */
export async function persistArtistPumpFun(
  input: PersistArtistPumpFunInput
): Promise<PersistArtistPumpFunResult> {
  const mint = input.mint.trim();
  const url = input.url.trim();
  const symbol = input.symbol.trim();
  const creatorWallet = input.creatorWallet.trim();

  if (!mint || !url || !symbol || !creatorWallet) {
    throw new ArtistPumpFunPersistError(
      400,
      'mint, url, symbol, and creatorWallet are required.'
    );
  }

  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.artists).doc(input.artistId);

  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new ArtistPumpFunPersistError(404, 'Artist not found');
    }

    const artist = snap.data() as AIArtistDocument;
    if (artist.deletedAt) {
      throw new ArtistPumpFunPersistError(404, 'Artist not found');
    }
    if (artist.ownerId !== input.userId) {
      throw new ArtistPumpFunPersistError(403, 'Only the owner can launch a coin');
    }

    const storedMint = existingMint(artist.pumpFun);
    if (storedMint || hasLaunchedCoin(artist.pumpFun)) {
      if (storedMint === mint) {
        return { pumpFun: artist.pumpFun as PumpFunCoin, noop: true };
      }
      throw new ArtistPumpFunPersistError(409, 'This artist already has a coin.');
    }

    const pumpFun: PumpFunCoin = {
      mint,
      url,
      symbol,
      launchedAt: AdminTimestamp.fromMillis(input.launchedAtMs) as unknown as Timestamp,
      creatorWallet,
    };

    tx.set(
      ref,
      {
        pumpFun,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { pumpFun, noop: false };
  });
}
