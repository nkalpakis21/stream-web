/**
 * Optional pump.fun coin launch for an artist.
 *
 * STATUS: STUBBED. Do not treat a call as a live launch, and never persist
 * invented mint/url/symbol values.
 *
 * Investigation: there is no official, documented REST API that creates a
 * pump.fun coin and returns a mint without wallet signing. Community
 * reverse-engineered endpoints (e.g. POST https://frontend-api-v3.pump.fun/coins/create)
 * require unofficial frontend JWTs and are not a supported integration.
 *
 * What a real launch needs:
 * 1. Token metadata JSON (name, symbol, image, description) hosted at a URI.
 * 2. Build a create (+ optional initial buy) transaction via the official
 *    @pump-fun/pump-sdk (`createInstruction` / `createAndBuyInstructions`)
 *    or POST https://fun-block.pump.fun/agents/create-coin, which
 *    partial-signs a mint keypair and returns a VersionedTransaction.
 * 3. The user's Solana wallet (`users.solanaWalletAddress`) co-signs and
 *    submits on mainnet. A send-capable RPC is required; public Solana RPC
 *    often cannot send these transactions.
 * 4. On confirmed success, persist mint, url (`https://pump.fun/coin/${mint}`),
 *    symbol, launchedAt, and creatorWallet on the artist `pumpFun` object.
 *
 * Until that path is wired, this function returns `unavailable` and the
 * artist is created with empty pump.fun fields.
 */

import { emptyPumpFunCoin, type PumpFunCoin } from '@/types/firestore';

export type ArtistPumpFunLaunchInput = {
  artistName: string;
  creatorWallet?: string | null;
};

export type ArtistPumpFunLaunchResult =
  | { ok: true; coin: PumpFunCoin }
  | { ok: false; unavailable: true; reason: string };

export async function launchArtistPumpFunCoin(
  _input: ArtistPumpFunLaunchInput
): Promise<ArtistPumpFunLaunchResult> {
  return {
    ok: false,
    unavailable: true,
    reason:
      'Coin launch on pump.fun is not available yet. Your artist was created without a token.',
  };
}

export function pumpFunFromLaunchResult(
  result: ArtistPumpFunLaunchResult | null
): PumpFunCoin {
  if (result?.ok) {
    return result.coin;
  }
  return emptyPumpFunCoin();
}

/**
 * Resolve pump.fun fields for artist create. Launch is attempted only when
 * the user opts in; otherwise fields stay empty and no launch is called.
 */
export async function resolvePumpFunForArtistCreate(input: {
  launchCoin: boolean;
  artistName: string;
  creatorWallet?: string | null;
}): Promise<{ pumpFun: PumpFunCoin; launchNotice: string | null }> {
  if (!input.launchCoin) {
    return { pumpFun: emptyPumpFunCoin(), launchNotice: null };
  }

  const result = await launchArtistPumpFunCoin({
    artistName: input.artistName,
    creatorWallet: input.creatorWallet,
  });

  return {
    pumpFun: pumpFunFromLaunchResult(result),
    launchNotice: result.ok ? null : result.reason,
  };
}
