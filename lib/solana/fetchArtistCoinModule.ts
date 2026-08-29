import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import { fetchCoinQuotes } from '@/lib/solana/fetchCoinQuotes';
import { fetchCoinHolders } from '@/lib/solana/fetchCoinHolders';

/**
 * Artist-page coin module. Price / 24h / mcap must all be live or the
 * module stays hidden. Volume, holders, and sparkline attach only when real.
 */
export async function fetchArtistCoinModule(
  mint: string | null | undefined
): Promise<ArtistCoinQuote | null> {
  const trimmed = (mint || '').trim();
  if (!trimmed) return null;

  const [quotes, holders] = await Promise.all([
    fetchCoinQuotes([trimmed]),
    fetchCoinHolders(trimmed),
  ]);

  const quote = quotes.get(trimmed);
  if (!quote) return null;

  return holders != null ? { ...quote, holders } : quote;
}
