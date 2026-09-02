import {
  formatChange24h,
  formatCoinPrice,
  type ArtistCoinQuote,
} from '@/lib/brand/coinStats';

const ZERO_VALUE = '$0';
const ZERO_CHANGE = '0%';

export const BAG_TIMEFRAMES = ['24H', '7D', '30D', 'ALL'] as const;
export type BagTimeframe = (typeof BAG_TIMEFRAMES)[number];

/** Token quantity for a bag row. Not a price — never invent a live-looking figure. */
export function formatTokenAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '0';
  if (amount >= 1_000_000_000) {
    const raw = (amount / 1_000_000_000).toFixed(1);
    return `${raw.endsWith('.0') ? raw.slice(0, -2) : raw}B`;
  }
  if (amount >= 1_000_000) {
    const raw = (amount / 1_000_000).toFixed(1);
    return `${raw.endsWith('.0') ? raw.slice(0, -2) : raw}M`;
  }
  if (amount >= 1) {
    return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  return amount.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export function holdingValueUsd(
  amount: number,
  quote: ArtistCoinQuote | null
): number {
  if (!quote) return 0;
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const value = amount * quote.priceUsd;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function formatHoldingValue(
  amount: number,
  quote: ArtistCoinQuote | null
): string {
  const value = holdingValueUsd(amount, quote);
  if (value <= 0) return ZERO_VALUE;
  return formatCoinPrice(value) || ZERO_VALUE;
}

export function formatHoldingChange(quote: ArtistCoinQuote | null): string {
  if (!quote) return ZERO_CHANGE;
  return formatChange24h(quote.change24h) || ZERO_CHANGE;
}

/** Signed USD for 24h bag delta. Zero and missing stay `$0`, never `+$0`. */
export function formatSignedUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return ZERO_VALUE;
  const formatted = formatCoinPrice(Math.abs(amount));
  if (!formatted) return ZERO_VALUE;
  return amount < 0 ? `-${formatted}` : `+${formatted}`;
}

export function bagTotals(
  rows: Array<{ amount: number; quote: ArtistCoinQuote | null }>
): { value: number; change24h: number; changeUsd: number; hasLive: boolean } {
  let value = 0;
  let previous = 0;

  for (const row of rows) {
    const now = holdingValueUsd(row.amount, row.quote);
    if (now <= 0 || !row.quote) continue;
    const denom = 1 + row.quote.change24h / 100;
    const prev =
      Number.isFinite(denom) && denom !== 0 ? now / denom : now;
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
    value: formatCoinPrice(totals.value) || ZERO_VALUE,
    change: formatChange24h(totals.change24h) || ZERO_CHANGE,
    changeUsd: formatSignedUsd(totals.changeUsd),
  };
}

/**
 * Bag value series for the selected range.
 * Only 24H can be composed from real Dexscreener sparkline points on every
 * live holding. 7D / 30D / ALL stay null until a real series exists — never
 * a fake dip, never a reused 24h line.
 */
export function bagValueSeries(
  rows: Array<{ amount: number; quote: ArtistCoinQuote | null }>,
  timeframe: BagTimeframe
): number[] | null {
  if (timeframe !== '24H') return null;

  const live = rows.filter(row => holdingValueUsd(row.amount, row.quote) > 0);
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
      const value = row.amount * price;
      if (Number.isFinite(value) && value > 0) sum += value;
    }
    series.push(sum);
  }

  return series;
}
