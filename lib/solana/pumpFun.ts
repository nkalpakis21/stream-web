/**
 * Shared pump.fun constants and validation for the optional artist coin.
 * No private keys. Mint + URL are persisted only after a confirmed on-chain launch.
 */

import { firstHttpSolanaRpcUrl } from '@/lib/solana/rpcUrl';

export const PUMP_FUN_COIN_URL_PREFIX = 'https://pump.fun/coin/';

/** Official pump.fun frontend create compute-unit budget (create only, no buy). */
export const PUMP_CREATE_COMPUTE_UNITS = 270_000;

/** Floor matching pump.fun skill scripts when getPriorityFeeEstimate is unavailable. */
export const PUMP_PRIORITY_MICRO_LAMPORTS = 100_000;

/** Built-in mainnet address lookup table used by pump.fun create txs. */
export const PUMP_ALT_ADDRESS_MAINNET =
  '7mFD2mUtRS65XstiSAvCJuYmdesZoQwCwRJhq1p3eRMe';

/**
 * Rent + fees for a create_v2 (no initial buy). A little SOL, not a pile of money.
 */
export const MIN_LAUNCH_LAMPORTS = 20_000_000; // 0.02 SOL

export const MAX_COIN_NAME_LENGTH = 32;
export const MAX_TICKER_LENGTH = 10;
export const MIN_TICKER_LENGTH = 2;

export const LAUNCH_FAILED_NOTICE =
  "The coin didn't go through. Your artist was created without a token.";

export function pumpFunCoinUrl(mint: string): string {
  return `${PUMP_FUN_COIN_URL_PREFIX}${mint}`;
}

export function getSolanaRpcUrl(): string {
  return (
    firstHttpSolanaRpcUrl(
      process.env.SOLANA_RPC_URL,
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL
    ) ?? 'https://api.mainnet-beta.solana.com'
  );
}

export function normalizeTicker(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, MAX_TICKER_LENGTH);
}

export function isValidTicker(ticker: string): boolean {
  return new RegExp(`^[A-Z0-9]{${MIN_TICKER_LENGTH},${MAX_TICKER_LENGTH}}$`).test(
    ticker
  );
}

export function isValidCoinName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= MAX_COIN_NAME_LENGTH;
}

export function defaultTickerFromName(name: string): string {
  const compact = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (compact.length >= MIN_TICKER_LENGTH) {
    return compact.slice(0, MAX_TICKER_LENGTH);
  }
  return 'COIN';
}

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}
