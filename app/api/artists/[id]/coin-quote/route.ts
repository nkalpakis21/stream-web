import { NextResponse } from 'next/server';
import { getArtistCardContext } from '@/lib/server/artistDisplay';
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
    return NextResponse.json({ quote: null, linkable: false });
  }

  try {
    const { displays, coins } = await getArtistCardContext([artistId]);
    const display = displays.get(artistId);
    const mint = coins.get(artistId)?.mint?.trim();
    if (!display || !mint) {
      return NextResponse.json({ quote: null, linkable: display?.isPublic === true });
    }

    const quotes = await fetchCoinQuotes([mint]);
    return NextResponse.json({
      quote: quotes.get(mint) ?? null,
      linkable: display.isPublic === true,
    });
  } catch {
    return NextResponse.json({ quote: null, linkable: false });
  }
}
