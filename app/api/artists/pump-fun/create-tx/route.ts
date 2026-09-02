/**
 * POST /api/artists/pump-fun/create-tx
 *
 * Builds an unsigned pump.fun create_v2 VersionedTransaction via @pump-fun/pump-sdk
 * and simulates it on the same RPC (sigVerify off) before returning. The client
 * generates the mint keypair and sends via wallet sendTransaction({ signers }).
 * No initial buy. Never accepts a private key or seed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { z } from 'zod';
import { errorResponse, HttpError, requireUserId } from '@/lib/api/requireAuth';
import {
  PumpFunCreateTxBuildError,
  buildUnsignedArtistPumpFunCreateTx,
} from '@/lib/solana/buildArtistPumpFunCreateTx';
import {
  MAX_COIN_NAME_LENGTH,
  MAX_TICKER_LENGTH,
  MIN_TICKER_LENGTH,
  isHttpsUrl,
  isValidTicker,
  normalizeTicker,
} from '@/lib/solana/pumpFun';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const bodySchema = z.object({
  mint: z.string().trim().min(32).max(44),
  user: z.string().trim().min(32).max(44),
  name: z.string().trim().min(1).max(MAX_COIN_NAME_LENGTH),
  symbol: z.string().trim().min(MIN_TICKER_LENGTH).max(MAX_TICKER_LENGTH),
  uri: z.string().trim().url(),
});

function parsePublicKey(value: string, field: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new HttpError(400, `Invalid ${field}.`);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUserId(request, {
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

    const mint = parsePublicKey(parsed.data.mint, 'mint');
    const user = parsePublicKey(parsed.data.user, 'wallet');

    const tx = await buildUnsignedArtistPumpFunCreateTx({
      mint,
      user,
      name: parsed.data.name.trim(),
      symbol,
      uri: parsed.data.uri,
    });

    const transaction = Buffer.from(tx.serialize()).toString('base64');

    return NextResponse.json({
      transaction,
      mint: mint.toBase58(),
    });
  } catch (error) {
    if (error instanceof PumpFunCreateTxBuildError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return errorResponse(error);
  }
}
