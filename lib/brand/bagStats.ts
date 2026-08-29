import {
  formatChange24h,
  formatCoinPrice,
  type ArtistCoinQuote,
} from '@/lib/brand/coinStats';

const ZERO_VALUE = '$0';
const ZERO_CHANGE = '0%';

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

export function bagTotals(
  rows: Array<{ amount: number; quote: ArtistCoinQuote | null }>
): { value: number; change24h: number; hasLive: boolean } {
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
    return { value: 0, change24h: 0, hasLive: false };
  }

  const change24h = previous > 0 ? ((value - previous) / previous) * 100 : 0;
  return {
    value,
    change24h: Number.isFinite(change24h) ? change24h : 0,
    hasLive: true,
  };
}

export function formatBagHeader(totals: {
  value: number;
  change24h: number;
  hasLive: boolean;
}): { value: string; change: string } {
  if (!totals.hasLive || totals.value <= 0) {
    return { value: ZERO_VALUE, change: ZERO_CHANGE };
  }
  return {
    value: formatCoinPrice(totals.value) || ZERO_VALUE,
    change: formatChange24h(totals.change24h) || ZERO_CHANGE,
  };
}
