/**
 * Bind a pump.fun mint to the verified uid before create-tx returns
 * an unsigned transaction. The doc is Admin-only: `coinMints/{mint}`.
 */

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { HttpError, errorResponse, requireUser } from '@/lib/server/auth';
import {
  PumpFunCreateTxBuildError,
  buildUnsignedArtistPumpFunCreateTx,
} from '@/lib/solana/buildArtistPumpFunCreateTx';
import {
  MAX_COIN_NAME_LENGTH,
  MAX_TICKER_LENGTH,
  METADATA_URI_TOO_LONG_NOTICE,
  MIN_TICKER_LENGTH,
  isHttpsUrl,
  isMetadataUriTooLong,
  isValidTicker,
  normalizeTicker,
} from '@/lib/solana/pumpFun';

const bodySchema = z.object({
  mint: z.string().trim().min(32).max(44),
  user: z.string().trim().min(32).max(44),
  name: z.string().trim().min(1).max(MAX_COIN_NAME_LENGTH),
  symbol: z.string().trim().min(MIN_TICKER_LENGTH).max(MAX_TICKER_LENGTH),
  uri: z.string().trim().url(),
});

export type CoinMintBinding = {
  uid: string;
  creatorWallet: string;
};

export type BindCoinMintResult = 'created' | 'exists';

function parsePublicKey(value: string, field: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new HttpError(400, `Invalid ${field}.`);
  }
}

function walletString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function readCoinMintBinding(data: unknown): CoinMintBinding | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const record = data as { uid?: unknown; creatorWallet?: unknown };
  const uid = typeof record.uid === 'string' ? record.uid.trim() : '';
  const creatorWallet = walletString(record.creatorWallet);
  if (!uid || !creatorWallet) return null;
  return { uid, creatorWallet };
}

/**
 * Create `coinMints/{mint}` for this uid. Same uid may retry.
 * A different uid gets 409. Any other write failure becomes 500
 * and must not be followed by a transaction.
 */
export async function bindCoinMint(
  db: Firestore,
  input: { mint: string; uid: string; creatorWallet: string }
): Promise<BindCoinMintResult> {
  const ref = db.collection(COLLECTIONS.coinMints).doc(input.mint);
  try {
    return await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const existing = readCoinMintBinding(snap.data());
        if (!existing || existing.uid !== input.uid) {
          throw new HttpError(409, 'This mint is already bound to another account.');
        }
        return 'exists' as const;
      }
      tx.set(ref, {
        uid: input.uid,
        creatorWallet: input.creatorWallet,
        createdAt: FieldValue.serverTimestamp(),
      });
      return 'created' as const;
    });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error('[coinMints] bind failed', { mint: input.mint });
    throw new HttpError(500, 'Could not bind this mint.');
  }
}

export type PumpFunCreateTxDeps = {
  requireUser?: typeof requireUser;
  db?: Firestore;
  buildTx?: typeof buildUnsignedArtistPumpFunCreateTx;
};

/** Auth, bind the mint, then build. A failed bind returns no transaction. */
export async function handlePumpFunCreateTx(
  request: NextRequest,
  deps?: PumpFunCreateTxDeps
): Promise<NextResponse> {
  const requireVerifiedUser = deps?.requireUser ?? requireUser;
  const db = deps?.db ?? getAdminDb();
  const buildTx = deps?.buildTx ?? buildUnsignedArtistPumpFunCreateTx;

  try {
    const uid = await requireVerifiedUser(request, {
      unavailableMessage: 'Coin launch is temporarily unavailable',
    });

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      throw new HttpError(400, 'Coin name, ticker, look, and wallet are required.');
    }

    const symbol = normalizeTicker(parsed.data.symbol);
    if (!isValidTicker(symbol)) {
      throw new HttpError(400, 'Ticker must be 2–10 letters or numbers.');
    }
    if (!isHttpsUrl(parsed.data.uri)) {
      throw new HttpError(400, 'Metadata URI must be https.');
    }
    if (isMetadataUriTooLong(parsed.data.uri)) {
      throw new HttpError(400, METADATA_URI_TOO_LONG_NOTICE);
    }

    const mint = parsePublicKey(parsed.data.mint, 'mint');
    const user = parsePublicKey(parsed.data.user, 'wallet');
    const mintAddress = mint.toBase58();

    await bindCoinMint(db, {
      mint: mintAddress,
      uid,
      creatorWallet: user.toBase58(),
    });

    const tx = await buildTx({
      mint,
      user,
      name: parsed.data.name.trim(),
      symbol,
      uri: parsed.data.uri,
    });

    return NextResponse.json({
      transaction: Buffer.from(tx.serialize()).toString('base64'),
      mint: mintAddress,
    });
  } catch (error) {
    if (error instanceof PumpFunCreateTxBuildError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return errorResponse(error);
  }
}
