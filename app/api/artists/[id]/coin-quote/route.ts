import { NextResponse } from 'next/server';
import { getArtist } from '@/lib/services/artists';
import { hasLaunchedCoin } from '@/lib/brand/coin';
import { fetchCoinQuotes } from '@/lib/solana/fetchCoinQuotes';

export const revalidate = 120;

/**
 * Honest Pulse chip quote for the now-playing artist.
 * Same Dexscreener + completeCoinQuote path as Heat.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const artistId = params.id?.trim();
  if (!artistId) {
    return NextResponse.json({ quote: null });
  }

  try {
    const artist = await getArtist(artistId);
    const mint = artist?.pumpFun?.mint?.trim();
    if (!artist || !hasLaunchedCoin(artist.pumpFun) || !mint) {
      return NextResponse.json({ quote: null });
    }

    const quotes = await fetchCoinQuotes([mint]);
    return NextResponse.json({ quote: quotes.get(mint) ?? null });
  } catch {
    return NextResponse.json({ quote: null });
  }
}
