import { completeCoinQuote, type ArtistCoinQuote } from '@/lib/brand/coinStats';

const DEXSCREENER_TOKENS = 'https://api.dexscreener.com/latest/dex/tokens';
const FETCH_MS = 4000;
const MAX_MINTS = 30;

interface DexPair {
  chainId?: string;
  priceUsd?: string;
  priceChange?: { h24?: number };
  marketCap?: number;
  liquidity?: { usd?: number };
  baseToken?: { address?: string };
  quoteToken?: { address?: string };
}

interface DexTokenResponse {
  pairs?: DexPair[] | null;
}

function parseMint(value?: string): string {
  return (value || '').trim();
}

function pairLiquidity(pair: DexPair): number {
  const usd = pair.liquidity?.usd;
  return Number.isFinite(usd) ? (usd as number) : 0;
}

function quoteFromPair(pair: DexPair): ArtistCoinQuote | null {
  const priceUsd = pair.priceUsd != null ? Number.parseFloat(pair.priceUsd) : null;
  return completeCoinQuote({
    priceUsd,
    change24h: pair.priceChange?.h24,
    marketCap: pair.marketCap,
  });
}

/**
 * Live quotes keyed by mint. Incomplete Dexscreener rows are omitted —
 * Heat hides the cluster rather than inventing PRICE / 24H / MCAP.
 */
export async function fetchCoinQuotes(mints: string[]): Promise<Map<string, ArtistCoinQuote>> {
  const unique = Array.from(
    new Set(mints.map(parseMint).filter(Boolean))
  ).slice(0, MAX_MINTS);

  const quotes = new Map<string, ArtistCoinQuote>();
  if (unique.length === 0) return quotes;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);

  try {
    const res = await fetch(`${DEXSCREENER_TOKENS}/${unique.join(',')}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      next: { revalidate: 120 },
    });
    if (!res.ok) return quotes;

    const body = (await res.json()) as DexTokenResponse;
    const pairs = Array.isArray(body.pairs) ? body.pairs : [];
    const wanted = new Map(unique.map(mint => [mint.toLowerCase(), mint]));
    const best = new Map<string, { quote: ArtistCoinQuote; liq: number }>();

    for (const pair of pairs) {
      const base = parseMint(pair.baseToken?.address).toLowerCase();
      const quoteMint = parseMint(pair.quoteToken?.address).toLowerCase();
      const mintKey = wanted.has(base) ? base : wanted.has(quoteMint) ? quoteMint : '';
      if (!mintKey) continue;
      const quote = quoteFromPair(pair);
      if (!quote) continue;
      const liq = pairLiquidity(pair);
      const current = best.get(mintKey);
      if (!current || liq > current.liq) {
        best.set(mintKey, { quote, liq });
      }
    }

    best.forEach(({ quote }, mintKey) => {
      const original = wanted.get(mintKey);
      if (original) quotes.set(original, quote);
    });
  } catch {
    return quotes;
  } finally {
    clearTimeout(timer);
  }

  return quotes;
}
