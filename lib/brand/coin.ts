/** Mint, url, and symbol. launchedAt may be a Timestamp or epoch millis. */
type CoinIdentity = {
  mint?: string | null;
  url?: string | null;
  symbol?: string | null;
} | null;

/** True only when an artist has a real launched coin — never invent mint/url. */
export function hasLaunchedCoin(coin?: CoinIdentity): boolean {
  return Boolean(coin?.mint && coin.url);
}

/**
 * Persisted ticker for a launched coin. Bare symbol, matching bag / pumpFun.symbol.
 * Null when the coin is unlaunched or symbol is empty — never invent "Coin".
 */
export function launchedCoinTicker(coin?: CoinIdentity): string | null {
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
  pumpFun?: CoinIdentity;
  avatarURL?: string | null;
} | null): CoinBadgeMeta | null {
  const ticker = launchedCoinTicker(artist?.pumpFun);
  if (!ticker) return null;
  const iconSrc = artist?.avatarURL?.trim() || null;
  return { ticker, iconSrc };
}
