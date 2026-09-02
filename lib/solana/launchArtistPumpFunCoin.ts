/**
 * Optional pump.fun coin launch for an artist.
 *
 * Official SDK: @pump-fun/pump-sdk (`createV2Instruction` — create only, no first buy).
 * The manager's connected wallet signs once. The mint keypair is generated in the
 * browser, passed as an extra signer to sendTransaction, and discarded. Never takes
 * a private key or seed. Do not pre-sign the mint then call signTransaction —
 * Phantom cannot simulate that v0 create_v2.
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
import type { SendTransactionOptions } from '@solana/wallet-adapter-base';
import { Timestamp } from 'firebase/firestore';
import { emptyPumpFunCoin, type PumpFunCoin } from '@/types/firestore';
import { userFacingApiError } from '@/lib/api/clientAuth';
import {
  LAUNCH_FAILED_NOTICE,
  LAUNCH_NO_TOKEN_NOTICE,
  LAUNCH_SEND_FAILED_NOTICE,
  LAUNCH_SIM_FAILED_NOTICE,
  LAUNCH_WALLET_BLOCKED_NOTICE,
  MIN_LAUNCH_LAMPORTS,
  isHttpsUrl,
  isValidCoinName,
  isValidTicker,
  normalizeTicker,
  pumpFunCoinUrl,
} from '@/lib/solana/pumpFun';

/**
 * Wallet surface from the Solana adapter used for create_v2.
 * sendTransaction({ signers }) is required so Phantom simulates with the mint.
 * signTransaction is the adapter method; do not pre-sign then call it.
 */
export type ArtistPumpFunWallet = {
  publicKey: PublicKey;
  sendTransaction: (
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
    options?: SendTransactionOptions
  ) => Promise<string>;
  signTransaction?: <T extends Transaction | VersionedTransaction>(
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

function collectErrorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return String(error ?? '');
  const parts: string[] = [];
  if (error instanceof Error && error.message) parts.push(error.message);
  const nested = 'error' in error ? error.error : undefined;
  if (nested instanceof Error && nested.message) parts.push(nested.message);
  else if (typeof nested === 'string') parts.push(nested);
  else if (
    nested &&
    nested !== error &&
    typeof nested === 'object' &&
    'message' in nested &&
    typeof nested.message === 'string'
  ) {
    parts.push(nested.message);
  }
  const code = 'code' in error ? error.code : undefined;
  if (typeof code === 'string' || typeof code === 'number') parts.push(String(code));
  const txError =
    'transactionError' in error && error.transactionError && typeof error.transactionError === 'object'
      ? error.transactionError
      : undefined;
  if (txError && 'message' in txError && typeof txError.message === 'string') {
    parts.push(txError.message);
  }
  const logs = collectErrorLogs(error);
  if (logs.length) parts.push(logs.slice(-4).join(' | '));
  return parts.join(' ');
}

function collectErrorLogs(error: unknown): string[] {
  if (!error || typeof error !== 'object') return [];
  const fromArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((line): line is string => typeof line === 'string') : [];
  if ('logs' in error) {
    const logs = fromArray(error.logs);
    if (logs.length) return logs;
  }
  if (
    'transactionError' in error &&
    error.transactionError &&
    typeof error.transactionError === 'object' &&
    'logs' in error.transactionError
  ) {
    const logs = fromArray(error.transactionError.logs);
    if (logs.length) return logs;
  }
  if ('error' in error && error.error && error.error !== error) {
    return collectErrorLogs(error.error);
  }
  return [];
}

function withErrorDetail(notice: string, error: unknown): string {
  const detail = collectErrorText(error).replace(/\s+/g, ' ').trim();
  if (!detail) return notice;
  if (notice.toLowerCase().includes(detail.toLowerCase())) return notice;
  const clipped = detail.length > 180 ? `${detail.slice(0, 177)}...` : detail;
  const combined = `${notice} (${clipped})`;
  return combined.length > 280 ? `${combined.slice(0, 277)}...` : combined;
}

function launchWalletErrorMessage(error: unknown): string {
  const raw = collectErrorText(error);
  if (/user rejected|rejected the request|cancelled|canceled/i.test(raw)) {
    return `You cancelled the wallet signature. ${LAUNCH_NO_TOKEN_NOTICE}`;
  }
  if (/blocked|malicious|not been authorized|unauthorized/i.test(raw)) {
    return withErrorDetail(LAUNCH_WALLET_BLOCKED_NOTICE, error);
  }
  if (/simulat|preflight/i.test(raw)) {
    return withErrorDetail(LAUNCH_SIM_FAILED_NOTICE, error);
  }
  if (/insufficient|0x1$|no record of a prior credit/i.test(raw)) {
    return withErrorDetail(
      `Not enough SOL for network fees. ${LAUNCH_NO_TOKEN_NOTICE}`,
      error
    );
  }
  if (/blockhash|expired|timed out|timeout/i.test(raw)) {
    return `The launch transaction expired. ${LAUNCH_NO_TOKEN_NOTICE}`;
  }
  return withErrorDetail(
    `Phantom couldn't complete the signature. ${LAUNCH_NO_TOKEN_NOTICE}`,
    error
  );
}

function launchSendErrorMessage(error: unknown): string {
  const raw = collectErrorText(error);
  if (/insufficient|0x1$|no record of a prior credit/i.test(raw)) {
    return withErrorDetail(
      `Not enough SOL for network fees. ${LAUNCH_NO_TOKEN_NOTICE}`,
      error
    );
  }
  if (/blockhash|expired|timed out|timeout/i.test(raw)) {
    return `The launch transaction expired. ${LAUNCH_NO_TOKEN_NOTICE}`;
  }
  if (/simulat|preflight/i.test(raw)) {
    return withErrorDetail(LAUNCH_SIM_FAILED_NOTICE, error);
  }
  return withErrorDetail(LAUNCH_SEND_FAILED_NOTICE, error);
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
  if (typeof input.wallet.sendTransaction !== 'function') {
    return fail(`Connect a wallet that can sign. ${LAUNCH_NO_TOKEN_NOTICE}`);
  }

  const creatorWallet = input.wallet.publicKey.toBase58();

  try {
    const balance = await input.connection.getBalance(input.wallet.publicKey);
    if (balance < MIN_LAUNCH_LAMPORTS) {
      return fail(
        `A little SOL is needed for network fees (about 0.02 SOL). ${LAUNCH_NO_TOKEN_NOTICE}`
      );
    }
  } catch {
    return fail(`Could not check wallet balance. ${LAUNCH_NO_TOKEN_NOTICE}`);
  }

  let token: string;
  try {
    token = await input.getIdToken();
  } catch (error) {
    return fail(userFacingApiError(undefined, error, LAUNCH_NO_TOKEN_NOTICE));
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
      userFacingApiError(metadataRes.status, metadataRes.error, LAUNCH_NO_TOKEN_NOTICE)
    );
  }
  const metadataUri = metadataRes.data.uri;
  if (!metadataUri || !isHttpsUrl(metadataUri)) {
    return fail(LAUNCH_NO_TOKEN_NOTICE);
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
    return fail(userFacingApiError(txRes.status, txRes.error, LAUNCH_NO_TOKEN_NOTICE));
  }
  if (!txRes.data.transaction || txRes.data.mint !== mint) {
    return fail(LAUNCH_NO_TOKEN_NOTICE);
  }

  let signature: string;
  try {
    const txBytes = Uint8Array.from(atob(txRes.data.transaction), c =>
      c.charCodeAt(0)
    );
    const tx = VersionedTransaction.deserialize(txBytes);
    // Extra signers go to sendTransaction so Phantom can simulate mint + user.
    // Do not mint-sign then signTransaction (Phantom sim fails). Do not
    // sendRawTransaction after a wallet signature: skipPreflight:false
    // preflight re-simulates and drops a Confirm-unsafe signature with no
    // on-chain activity.
    signature = await input.wallet.sendTransaction(tx, input.connection, {
      signers: [mintKeypair],
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
  } catch (error) {
    return fail(launchWalletErrorMessage(error));
  }

  try {
    const latest = await input.connection.getLatestBlockhash('confirmed');
    const confirmation = await input.connection.confirmTransaction(
      { signature, ...latest },
      'confirmed'
    );
    if (confirmation.value.err) {
      return fail(
        withErrorDetail(
          LAUNCH_SEND_FAILED_NOTICE,
          JSON.stringify(confirmation.value.err)
        )
      );
    }
  } catch (error) {
    return fail(launchSendErrorMessage(error));
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

/**
 * Launch on an existing artist. Returns a confirmed coin or a create-style
 * failure notice. Never invents mint/url/symbol — the caller persists only
 * after success. The artist document is left unchanged on failure.
 */
export async function launchPumpFunForExistingArtist(
  input: Omit<ResolvePumpFunForArtistCreateInput, 'launchCoin'>
): Promise<{ coin: PumpFunCoin | null; launchNotice: string | null }> {
  if (!input.wallet || !input.connection || !input.getIdToken) {
    return {
      coin: null,
      launchNotice: `Connect your wallet in the nav, then try again next time. ${LAUNCH_NO_TOKEN_NOTICE}`,
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

  if (!result.ok) {
    return { coin: null, launchNotice: result.reason };
  }

  return { coin: result.coin, launchNotice: null };
}
