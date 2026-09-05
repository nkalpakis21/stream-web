import type { PumpFunCoin } from '@/types/firestore';

/** True only when an artist has a real launched coin — never invent mint/url. */
export function hasLaunchedCoin(coin?: PumpFunCoin | null): boolean {
  return Boolean(coin?.mint && coin.url);
}

/**
 * Persisted ticker for a launched coin. Bare symbol, matching bag / pumpFun.symbol.
 * Null when the coin is unlaunched or symbol is empty — never invent "Coin".
 */
export function launchedCoinTicker(coin?: PumpFunCoin | null): string | null {
  if (!hasLaunchedCoin(coin)) return null;
  const ticker = coin?.symbol?.trim();
  return ticker || null;
}

export type CoinBadgeMeta = {
  ticker: string;
  iconSrc: string | null;
};

/** Chip payload: ticker + look (the coin image) when we have one. */
export function coinBadgeFromArtist(artist?: {
  pumpFun?: PumpFunCoin | null;
  avatarURL?: string | null;
} | null): CoinBadgeMeta | null {
  const ticker = launchedCoinTicker(artist?.pumpFun);
  if (!ticker) return null;
  const iconSrc = artist?.avatarURL?.trim() || null;
  return { ticker, iconSrc };
}
