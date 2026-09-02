import {
  formatChange24h,
  formatCoinMcap,
  type ArtistCoinQuote,
} from '@/lib/brand/coinStats';

const ZERO_VALUE = '$0';
const ZERO_CHANGE = '0%';

export const BAG_TIMEFRAMES = ['24H', '7D', '30D', 'ALL'] as const;
export type BagTimeframe = (typeof BAG_TIMEFRAMES)[number];

/** Row / header USD is Dexscreener market cap. Missing or non-positive → 0. */
export function holdingMarketCap(quote: ArtistCoinQuote | null): number {
  if (!quote) return 0;
  const value = quote.marketCap;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function formatHoldingValue(quote: ArtistCoinQuote | null): string {
  const value = holdingMarketCap(quote);
  if (value <= 0) return ZERO_VALUE;
  return formatCoinMcap(value) || ZERO_VALUE;
}

export function formatHoldingChange(quote: ArtistCoinQuote | null): string {
  if (!quote) return ZERO_CHANGE;
  return formatChange24h(quote.change24h) || ZERO_CHANGE;
}

/** Signed USD for 24h bag delta. Zero and missing stay `$0`, never `+$0`. */
export function formatSignedUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return ZERO_VALUE;
  const formatted = formatCoinMcap(Math.abs(amount));
  if (!formatted) return ZERO_VALUE;
  return amount < 0 ? `-${formatted}` : `+${formatted}`;
}

export function bagTotals(
  rows: Array<{ quote: ArtistCoinQuote | null }>
): { value: number; change24h: number; changeUsd: number; hasLive: boolean } {
  let value = 0;
  let previous = 0;

  for (const row of rows) {
    const now = holdingMarketCap(row.quote);
    if (now <= 0 || !row.quote) continue;
    const change = row.quote.change24h;
    const denom = 1 + change / 100;
    const prev =
      Number.isFinite(change) && Number.isFinite(denom) && denom !== 0
        ? now / denom
        : now;
    value += now;
    previous += Number.isFinite(prev) && prev > 0 ? prev : now;
  }

  if (value <= 0) {
    return { value: 0, change24h: 0, changeUsd: 0, hasLive: false };
  }

  const changeUsd = value - previous;
  const change24h = previous > 0 ? (changeUsd / previous) * 100 : 0;
  return {
    value,
    change24h: Number.isFinite(change24h) ? change24h : 0,
    changeUsd: Number.isFinite(changeUsd) ? changeUsd : 0,
    hasLive: true,
  };
}

export function formatBagHeader(totals: {
  value: number;
  change24h: number;
  changeUsd: number;
  hasLive: boolean;
}): { value: string; change: string; changeUsd: string } {
  if (!totals.hasLive || totals.value <= 0) {
    return { value: ZERO_VALUE, change: ZERO_CHANGE, changeUsd: ZERO_VALUE };
  }
  return {
    value: formatCoinMcap(totals.value) || ZERO_VALUE,
    change: formatChange24h(totals.change24h) || ZERO_CHANGE,
    changeUsd: formatSignedUsd(totals.changeUsd),
  };
}

/**
 * Implied market-cap series from Dexscreener price windows (constant supply).
 * Missing sparkline or missing MC stays null — the chart paints a flat zero line.
 */
function sparklineMarketCap(quote: ArtistCoinQuote, price: number): number {
  const mc = holdingMarketCap(quote);
  if (mc <= 0 || !Number.isFinite(quote.priceUsd) || quote.priceUsd <= 0) {
    return 0;
  }
  if (!Number.isFinite(price) || price <= 0) return 0;
  const value = mc * (price / quote.priceUsd);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Bag value series for the selected range.
 * Only 24H can be composed from real Dexscreener sparkline points on every
 * live holding. 7D / 30D / ALL stay null until a real series exists — never
 * a fake dip, never a reused 24h line.
 */
export function bagValueSeries(
  rows: Array<{ quote: ArtistCoinQuote | null }>,
  timeframe: BagTimeframe
): number[] | null {
  if (timeframe !== '24H') return null;

  const live = rows.filter(row => holdingMarketCap(row.quote) > 0);
  if (live.length === 0) return null;
  if (live.some(row => !row.quote?.sparkline || row.quote.sparkline.length < 2)) {
    return null;
  }

  const minLen = Math.min(...live.map(row => row.quote!.sparkline!.length));
  if (minLen < 2) return null;

  const series: number[] = [];
  for (let i = 0; i < minLen; i++) {
    let sum = 0;
    for (const row of live) {
      const points = row.quote!.sparkline!;
      const price = points[points.length - minLen + i];
      const value = sparklineMarketCap(row.quote!, price);
      if (value > 0) sum += value;
    }
    series.push(sum);
  }

  return series;
}
