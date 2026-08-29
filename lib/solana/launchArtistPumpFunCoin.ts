/**
 * Optional pump.fun coin launch for an artist.
 *
 * Official SDK: @pump-fun/pump-sdk (`createV2Instruction` — create only, no first buy).
 * The manager's connected wallet signs once. The mint keypair is generated in the
 * browser, used to co-sign create_v2, and discarded. Never takes a private key or seed.
 *
 * Persist mint + pump.fun URL only after the transaction is confirmed.
 * If launch fails, the caller still creates the artist with empty pump.fun fields.
 */

import {
  Keypair,
  PublicKey,
  VersionedTransaction,
  type Connection,
  type Transaction,
} from '@solana/web3.js';
import { Timestamp } from 'firebase/firestore';
import { emptyPumpFunCoin, type PumpFunCoin } from '@/types/firestore';
import { userFacingApiError } from '@/lib/api/clientAuth';
import {
  LAUNCH_FAILED_NOTICE,
  MIN_LAUNCH_LAMPORTS,
  isHttpsUrl,
  isValidCoinName,
  isValidTicker,
  normalizeTicker,
  pumpFunCoinUrl,
} from '@/lib/solana/pumpFun';

export type ArtistPumpFunWallet = {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction | VersionedTransaction>(
    transaction: T
  ) => Promise<T>;
};

export type ArtistPumpFunLaunchInput = {
  coinName: string;
  ticker: string;
  imageUrl: string;
  description?: string;
  wallet: ArtistPumpFunWallet;
  connection: Connection;
  getIdToken: () => Promise<string>;
};

export type ArtistPumpFunLaunchResult =
  | { ok: true; coin: PumpFunCoin }
  | { ok: false; unavailable?: true; reason: string };

function fail(reason: string): ArtistPumpFunLaunchResult {
  return { ok: false, reason };
}

function launchErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (/user rejected|rejected the request|cancelled|canceled/i.test(raw)) {
    return `You cancelled the wallet signature. ${LAUNCH_FAILED_NOTICE}`;
  }
  if (/insufficient|0x1$/i.test(raw) || /no record of a prior credit/i.test(raw)) {
    return `Not enough SOL for network fees. ${LAUNCH_FAILED_NOTICE}`;
  }
  if (/blockhash|expired|timed out|timeout/i.test(raw)) {
    return `The launch transaction expired. ${LAUNCH_FAILED_NOTICE}`;
  }
  return LAUNCH_FAILED_NOTICE;
}

async function postJson<T>(
  url: string,
  token: string,
  body: unknown
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: unknown }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: res.status, error: data?.error ?? data };
  }
  return { ok: true, data: data as T };
}

export async function launchArtistPumpFunCoin(
  input: ArtistPumpFunLaunchInput
): Promise<ArtistPumpFunLaunchResult> {
  const coinName = input.coinName.trim();
  const ticker = normalizeTicker(input.ticker);
  const imageUrl = input.imageUrl.trim();

  if (!isValidCoinName(coinName) || !isValidTicker(ticker)) {
    return fail(`Name and ticker are required. ${LAUNCH_FAILED_NOTICE}`);
  }
  if (!imageUrl || !isHttpsUrl(imageUrl)) {
    return fail(
      `Lock a look first — that image is the coin. ${LAUNCH_FAILED_NOTICE}`
    );
  }
  if (!input.wallet.signTransaction) {
    return fail(`Connect a wallet that can sign. ${LAUNCH_FAILED_NOTICE}`);
  }

  const creatorWallet = input.wallet.publicKey.toBase58();

  try {
    const balance = await input.connection.getBalance(input.wallet.publicKey);
    if (balance < MIN_LAUNCH_LAMPORTS) {
      return fail(
        `A little SOL is needed for network fees (about 0.02 SOL). ${LAUNCH_FAILED_NOTICE}`
      );
    }
  } catch {
    return fail(`Could not check wallet balance. ${LAUNCH_FAILED_NOTICE}`);
  }

  let token: string;
  try {
    token = await input.getIdToken();
  } catch (error) {
    return fail(userFacingApiError(undefined, error, LAUNCH_FAILED_NOTICE));
  }

  const metadataRes = await postJson<{ uri: string }>(
    '/api/artists/pump-fun/metadata',
    token,
    {
      name: coinName,
      symbol: ticker,
      description: (input.description || '').slice(0, 500),
      image: imageUrl,
    }
  );
  if (!metadataRes.ok) {
    return fail(
      userFacingApiError(metadataRes.status, metadataRes.error, LAUNCH_FAILED_NOTICE)
    );
  }
  const metadataUri = metadataRes.data.uri;
  if (!metadataUri || !isHttpsUrl(metadataUri)) {
    return fail(LAUNCH_FAILED_NOTICE);
  }

  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey.toBase58();

  const txRes = await postJson<{ transaction: string; mint: string }>(
    '/api/artists/pump-fun/create-tx',
    token,
    {
      mint,
      user: creatorWallet,
      name: coinName,
      symbol: ticker,
      uri: metadataUri,
    }
  );
  if (!txRes.ok) {
    return fail(userFacingApiError(txRes.status, txRes.error, LAUNCH_FAILED_NOTICE));
  }
  if (!txRes.data.transaction || txRes.data.mint !== mint) {
    return fail(LAUNCH_FAILED_NOTICE);
  }

  let signed: VersionedTransaction;
  try {
    const txBytes = Uint8Array.from(atob(txRes.data.transaction), c =>
      c.charCodeAt(0)
    );
    const tx = VersionedTransaction.deserialize(txBytes);
    tx.sign([mintKeypair]);
    signed = await input.wallet.signTransaction(tx);
  } catch (error) {
    return fail(launchErrorMessage(error));
  }

  try {
    const latest = await input.connection.getLatestBlockhash('confirmed');
    const signature = await input.connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    const confirmation = await input.connection.confirmTransaction(
      { signature, ...latest },
      'confirmed'
    );
    if (confirmation.value.err) {
      return fail(LAUNCH_FAILED_NOTICE);
    }
  } catch (error) {
    return fail(launchErrorMessage(error));
  }

  return {
    ok: true,
    coin: {
      mint,
      url: pumpFunCoinUrl(mint),
      symbol: ticker,
      launchedAt: Timestamp.now(),
      creatorWallet,
    },
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

export type ResolvePumpFunForArtistCreateInput = {
  launchCoin: boolean;
  coinName: string;
  ticker: string;
  imageUrl: string | null;
  description?: string;
  wallet: ArtistPumpFunWallet | null;
  connection: Connection | null;
  getIdToken?: () => Promise<string>;
};

/**
 * Resolve pump.fun fields for artist create. Launch is attempted only when
 * the user opts in; otherwise fields stay empty and no launch is called.
 * Failures never invent mint/url/symbol — artist create still proceeds.
 */
export async function resolvePumpFunForArtistCreate(
  input: ResolvePumpFunForArtistCreateInput
): Promise<{ pumpFun: PumpFunCoin; launchNotice: string | null }> {
  if (!input.launchCoin) {
    return { pumpFun: emptyPumpFunCoin(), launchNotice: null };
  }

  if (!input.wallet || !input.connection || !input.getIdToken) {
    return {
      pumpFun: emptyPumpFunCoin(),
      launchNotice: `Connect your wallet in the nav, then try again next time. ${LAUNCH_FAILED_NOTICE}`,
    };
  }

  const result = await launchArtistPumpFunCoin({
    coinName: input.coinName,
    ticker: input.ticker,
    imageUrl: input.imageUrl || '',
    description: input.description,
    wallet: input.wallet,
    connection: input.connection,
    getIdToken: input.getIdToken,
  });

  return {
    pumpFun: pumpFunFromLaunchResult(result),
    launchNotice: result.ok ? null : result.reason,
  };
}
