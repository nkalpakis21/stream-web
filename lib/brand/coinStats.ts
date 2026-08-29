/**
 * Honest artist-coin quotes for Heat / featured meta.
 * Show PRICE / 24H / MCAP only when all three values exist.
 * Never invent volume, holders, or per-track mcaps.
 */

export interface ArtistCoinQuote {
  priceUsd: number;
  change24h: number;
  marketCap: number;
  /** Present only when Dexscreener reported a real 24h volume. */
  volume24h?: number;
  /** Present only when a live holder count was returned. */
  holders?: number;
  /** Real interval prices from Dexscreener change windows. Hidden if shorter than 2. */
  sparkline?: number[];
}

export function completeCoinQuote(input: {
  priceUsd?: number | null;
  change24h?: number | null;
  marketCap?: number | null;
}): ArtistCoinQuote | null {
  const { priceUsd, change24h, marketCap } = input;
  if (priceUsd == null || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  if (change24h == null || !Number.isFinite(change24h)) return null;
  if (marketCap == null || !Number.isFinite(marketCap) || marketCap < 0) return null;
  return { priceUsd, change24h, marketCap };
}

export function formatCoinPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return '';
  if (price >= 1) {
    return `$${price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (price >= 0.01) {
    const raw = price.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    const decimals = raw.split('.')[1]?.length ?? 0;
    return `$${decimals < 2 ? price.toFixed(2) : raw}`;
  }
  if (price >= 0.0001) {
    return `$${price.toFixed(4)}`;
  }
  const asFixed = price.toFixed(8).replace(/0+$/, '');
  return `$${asFixed}`;
}

export function formatChange24h(change: number): string {
  if (!Number.isFinite(change)) return '';
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

export function formatCoinMcap(mcap: number): string {
  if (!Number.isFinite(mcap) || mcap < 0) return '';
  const compact = (value: number, suffix: string) => {
    const raw = value >= 10 ? value.toFixed(0) : value.toFixed(1);
    const cleaned = raw.endsWith('.0') ? raw.slice(0, -2) : raw;
    return `$${cleaned}${suffix}`;
  };
  if (mcap >= 1_000_000_000) return compact(mcap / 1_000_000_000, 'B');
  if (mcap >= 1_000_000) return compact(mcap / 1_000_000, 'M');
  if (mcap >= 1_000) return compact(mcap / 1_000, 'K');
  return `$${Math.round(mcap)}`;
}

export type CoinChangeTone = 'up' | 'down' | 'flat';

export function coinChangeTone(change: number): CoinChangeTone {
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'flat';
}

export function formatCoinCluster(quote: ArtistCoinQuote) {
  return {
    price: formatCoinPrice(quote.priceUsd),
    change: formatChange24h(quote.change24h),
    mcap: formatCoinMcap(quote.marketCap),
    tone: coinChangeTone(quote.change24h),
  };
}

/** Same compact $ format as mcap. Empty when the value is not a real number. */
export function formatCoinVolume(volume: number): string {
  return formatCoinMcap(volume);
}

export function formatCoinHolders(holders: number): string {
  if (!Number.isFinite(holders) || holders < 0) return '';
  return Math.round(holders).toLocaleString('en-US');
}
