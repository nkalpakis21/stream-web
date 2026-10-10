/**
 * POST /api/artists/[id]/pump-fun
 *
 * Persist a confirmed artist-level pump.fun coin on an existing artist.
 * Owner-only. Call only after the wallet-signed create_v2 confirms.
 * No-ops when the same mint is already stored. Rejects a different mint
 * or an empty write so a live coin is never overwritten with blanks.
 * Optional coinMetadataId is stored on the artist document root only after
 * Storage uploadedBy matches this user. If the object is missing, Storage
 * errors or times out, uploadedBy is a different uid, the explicit id is
 * malformed, or the id cannot be verified for any other reason, the coin is
 * still saved without coinMetadataId and coinImagePath. A different uploader
 * logs coin_metadata_unverified with reason foreign_uploader and no uid. A
 * malformed explicit id logs invalid_id and does not open a client path.
 * The same rules apply when the id is taken from a metadata URI or from
 * coinMetadataUploads. Metadata never rejects this route. mint stays on pumpFun.
 * After a successful persist (including a same-mint no-op), the handler runs
 * verifyArtistMint. A coinMints binding whose uid is the owner, and whose
 * creatorWallet matches the bonding-curve creator, sets pumpFun.verifiedAt.
 * A different uid or a clear on-chain mismatch clears pumpFun. No coinMints
 * doc still returns the saved coin, without verifiedAt, and logs
 * coin_saved_unbound. The cron may clear that coin later.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { z } from 'zod';
import { errorResponse, HttpError, requireUserId } from '@/lib/api/requireAuth';
import {
  ArtistPumpFunPersistError,
  persistArtistPumpFun,
  type PersistArtistPumpFunDeps,
  type PersistArtistPumpFunInput,
  type PersistArtistPumpFunResult,
} from '@/lib/services/artistPumpFun';
import {
  verifyArtistMint,
  type VerifyArtistMintDeps,
  type VerifyArtistMintResult,
} from '@/lib/server/verifyArtistMint';
import {
  isValidTicker,
  normalizeTicker,
  pumpFunCoinUrl,
} from '@/lib/solana/pumpFun';
import { emptyPumpFunCoin, type PumpFunCoin } from '@/types/firestore';

const bodySchema = z.object({
  mint: z.string().trim().min(32).max(44),
  url: z.string().trim().url(),
  symbol: z.string().trim().min(2).max(10),
  launchedAt: z.number().int().positive().optional(),
  creatorWallet: z.string().trim().min(32).max(44),
  /** `{id}` returned by POST /api/artists/pump-fun/metadata. Omitted by older clients. */
  coinMetadataId: z.string().trim().max(200).nullish(),
  /** Public `/c/{id}` URI. Used only when coinMetadataId is omitted. */
  metadataUri: z.string().trim().max(500).nullish(),
  uri: z.string().trim().max(500).nullish(),
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

export type PumpFunConfirmDeps = {
  requireUserId?: typeof requireUserId;
  persistArtistPumpFun?: (
    input: PersistArtistPumpFunInput,
    deps?: PersistArtistPumpFunDeps
  ) => Promise<PersistArtistPumpFunResult>;
  verifyArtistMint?: (
    artistId: string,
    deps?: VerifyArtistMintDeps
  ) => Promise<VerifyArtistMintResult>;
  verifyDeps?: VerifyArtistMintDeps;
};

export async function handlePumpFunConfirm(
  request: NextRequest,
  artistId: string,
  deps?: PumpFunConfirmDeps
): Promise<NextResponse> {
  const requireUser = deps?.requireUserId ?? requireUserId;
  const persist = deps?.persistArtistPumpFun ?? persistArtistPumpFun;
  const verify = deps?.verifyArtistMint ?? verifyArtistMint;

  try {
    const userId = await requireUser(request, {
      unavailableMessage: 'Coin launch is temporarily unavailable',
    });

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      throw new HttpError(400, 'mint, url, symbol, and creatorWallet are required.');
    }

    const mint = parsePublicKey(parsed.data.mint, 'mint').toBase58();
    const creatorWallet = parsePublicKey(parsed.data.creatorWallet, 'wallet').toBase58();
    const symbol = normalizeTicker(parsed.data.symbol);
    if (!isValidTicker(symbol)) {
      throw new HttpError(400, 'Ticker must be 2–10 letters or numbers.');
    }

    const url = parsed.data.url.trim();
    if (url !== pumpFunCoinUrl(mint)) {
      throw new HttpError(400, 'url must be the pump.fun coin page for this mint.');
    }

    const metadataUri = parsed.data.metadataUri?.trim() || parsed.data.uri?.trim() || null;

    const result = await persist({
      artistId,
      userId,
      mint,
      url,
      symbol,
      launchedAtMs: parsed.data.launchedAt ?? Date.now(),
      creatorWallet,
      coinMetadataId: parsed.data.coinMetadataId,
      metadataUri,
    });

    const check = await verify(artistId, { ...deps?.verifyDeps, unbound: 'leave' });
    if (check.result === 'unbound') {
      console.info('coin_saved_unbound', { artistId, mint: check.mint });
    } else if (check.result === 'cleared') {
      return NextResponse.json({
        pumpFun: serializePumpFun(emptyPumpFunCoin()),
        coinMetadataId: result.coinMetadataId,
        coinImagePath: result.coinImagePath,
        noop: false,
        verified: false,
        cleared: check.reason,
      });
    }

    return NextResponse.json({
      pumpFun: serializePumpFun(result.pumpFun),
      coinMetadataId: result.coinMetadataId,
      coinImagePath: result.coinImagePath,
      noop: result.noop,
      verified: check.result === 'matched',
    });
  } catch (error) {
    if (error instanceof ArtistPumpFunPersistError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return errorResponse(error);
  }
}
