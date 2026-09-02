import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { hasLaunchedCoin } from '@/lib/brand/coin';
import { getLaunchedArtistsByMints } from '@/lib/services/artists';
import { fetchCoinQuotes } from '@/lib/solana/fetchCoinQuotes';
import { fetchWalletTokenBalances } from '@/lib/solana/fetchWalletTokenBalances';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_QUOTES_CHUNK = 30;

async function quotesForMints(
  mints: string[]
): Promise<Map<string, ArtistCoinQuote>> {
  const quotes = new Map<string, ArtistCoinQuote>();
  for (let i = 0; i < mints.length; i += MAX_QUOTES_CHUNK) {
    const chunk = await fetchCoinQuotes(mints.slice(i, i + MAX_QUOTES_CHUNK));
    chunk.forEach((quote, mint) => quotes.set(mint, quote));
  }
  return quotes;
}

/**
 * GET /api/me/holdings?wallet=
 * This wallet's balances of launched artist coins only.
 * Fail-soft when RPC is missing — empty holdings, never invented balances.
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet')?.trim() || '';
  if (!wallet) {
    return NextResponse.json({ error: 'Wallet is required' }, { status: 400 });
  }

  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: 'Wallet is required' }, { status: 400 });
  }

  try {
    const balances = await fetchWalletTokenBalances(wallet);
    if (balances.length === 0) {
      return NextResponse.json({ holdings: [] });
    }

    const artists = await getLaunchedArtistsByMints(balances.map(row => row.mint));
    const artistByMint = new Map<string, (typeof artists)[number]>();
    for (const artist of artists) {
      const mint = artist.pumpFun?.mint?.trim();
      if (!mint || !hasLaunchedCoin(artist.pumpFun)) continue;
      if (!artistByMint.has(mint)) artistByMint.set(mint, artist);
    }

    const matched = balances.filter(row => artistByMint.has(row.mint));
    const quotes = await quotesForMints(matched.map(row => row.mint));

    const holdings = matched.map(row => {
      const artist = artistByMint.get(row.mint)!;
      const buyUrl = artist.pumpFun?.url?.trim() || null;
      return {
        artistId: artist.id,
        name: artist.name,
        avatarURL: artist.avatarURL,
        ticker: artist.pumpFun?.symbol?.trim() || null,
        mint: row.mint,
        buyUrl,
        amount: row.amount,
        quote: quotes.get(row.mint) ?? null,
      };
    });

    holdings.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ holdings });
  } catch (error) {
    console.error('[API /me/holdings] Error:', error);
    return NextResponse.json({ holdings: [] });
  }
}
