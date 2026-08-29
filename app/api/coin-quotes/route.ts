import { NextRequest, NextResponse } from 'next/server';
import { fetchCoinQuotes } from '@/lib/solana/fetchCoinQuotes';

export const runtime = 'nodejs';

/**
 * GET /api/coin-quotes?mints=a,b
 * Live Dexscreener quotes keyed by mint. Incomplete rows are omitted.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('mints') || '';
  const mints = raw
    .split(',')
    .map(mint => mint.trim())
    .filter(Boolean)
    .slice(0, 30);

  const quotes = await fetchCoinQuotes(mints);
  return NextResponse.json({
    quotes: Object.fromEntries(quotes),
  });
}
