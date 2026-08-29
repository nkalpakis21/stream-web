/**
 * POST /api/artists/[id]/pump-fun
 *
 * Persist a confirmed artist-level pump.fun coin on an existing artist.
 * Owner-only. Call only after the wallet-signed create_v2 confirms.
 * No-ops when the same mint is already stored. Rejects a different mint
 * or an empty write so a live coin is never overwritten with blanks.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { z } from 'zod';
import { errorResponse, HttpError, requireUserId } from '@/lib/api/requireAuth';
import {
  ArtistPumpFunPersistError,
  persistArtistPumpFun,
} from '@/lib/services/artistPumpFun';
import {
  isValidTicker,
  normalizeTicker,
  pumpFunCoinUrl,
} from '@/lib/solana/pumpFun';
import type { PumpFunCoin } from '@/types/firestore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({
  mint: z.string().trim().min(32).max(44),
  url: z.string().trim().url(),
  symbol: z.string().trim().min(2).max(10),
  launchedAt: z.number().int().positive().optional(),
  creatorWallet: z.string().trim().min(32).max(44),
});

function parsePublicKey(value: string, field: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new HttpError(400, `Invalid ${field}.`);
  }
}

function serializePumpFun(pumpFun: PumpFunCoin) {
  return {
    mint: pumpFun.mint,
    url: pumpFun.url,
    symbol: pumpFun.symbol,
    launchedAt: pumpFun.launchedAt ? pumpFun.launchedAt.toMillis() : null,
    creatorWallet: pumpFun.creatorWallet,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId(request, {
      unavailableMessage: 'Coin launch is temporarily unavailable',
    });

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      throw new HttpError(400, 'mint, url, symbol, and creatorWallet are required.');
    }

    const mint = parsePublicKey(parsed.data.mint, 'mint').toBase58();
    const creatorWallet = parsePublicKey(
      parsed.data.creatorWallet,
      'wallet'
    ).toBase58();
    const symbol = normalizeTicker(parsed.data.symbol);
    if (!isValidTicker(symbol)) {
      throw new HttpError(400, 'Ticker must be 2–10 letters or numbers.');
    }

    const url = parsed.data.url.trim();
    if (url !== pumpFunCoinUrl(mint)) {
      throw new HttpError(400, 'url must be the pump.fun coin page for this mint.');
    }

    const { pumpFun, noop } = await persistArtistPumpFun({
      artistId: params.id,
      userId,
      mint,
      url,
      symbol,
      launchedAtMs: parsed.data.launchedAt ?? Date.now(),
      creatorWallet,
    });

    return NextResponse.json({
      pumpFun: serializePumpFun(pumpFun),
      noop,
    });
  } catch (error) {
    if (error instanceof ArtistPumpFunPersistError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return errorResponse(error);
  }
}
