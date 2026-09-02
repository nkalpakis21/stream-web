import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, requireUserId } from '@/lib/api/requireAuth';
import { hasLaunchedCoin } from '@/lib/brand/coin';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAdminDb } from '@/lib/firebase/admin';
import { fetchCoinQuotes } from '@/lib/solana/fetchCoinQuotes';
import type { AIArtistDocument } from '@/types/firestore';

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
 * Launched artist coins owned by this user (created + hasLaunchedCoin).
 * Admin read after requireUserId — client Firestore on the server has no auth.
 * Dedupes by mint so a bag cannot double-count.
 */
async function getOwnedLaunchedArtists(
  userId: string
): Promise<AIArtistDocument[]> {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.artists)
    .where('ownerId', '==', userId)
    .get();

  const byMint = new Map<string, AIArtistDocument>();
  for (const docSnap of snap.docs) {
    const data = docSnap.data() as AIArtistDocument;
    const artist = { ...data, id: data.id || docSnap.id };
    if (artist.deletedAt) continue;
    if (artist.ownerId !== userId) continue;
    if (!hasLaunchedCoin(artist.pumpFun)) continue;
    const mint = artist.pumpFun?.mint?.trim();
    if (!mint || byMint.has(mint)) continue;
    byMint.set(mint, artist);
  }
  return Array.from(byMint.values());
}

/**
 * GET /api/me/holdings
 * Signed-in user's launched artist coins, quoted by Dexscreener.
 * Wallet is not the source of truth. Missing quotes stay null — the bag paints $0.
 */
export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId(request);
  } catch (error) {
    return errorResponse(error);
  }

  try {
    const artists = await getOwnedLaunchedArtists(userId);
    const mints = artists.map(artist => artist.pumpFun!.mint!.trim());
    const quotes = await quotesForMints(mints);

    const holdings = artists.map(artist => {
      const mint = artist.pumpFun!.mint!.trim();
      const buyUrl = artist.pumpFun?.url?.trim() || null;
      return {
        artistId: artist.id,
        name: artist.name,
        avatarURL: artist.avatarURL,
        ticker: artist.pumpFun?.symbol?.trim() || null,
        mint,
        buyUrl,
        quote: quotes.get(mint) ?? null,
      };
    });

    holdings.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ holdings });
  } catch (error) {
    console.error('[API /me/holdings] Error:', error);
    return NextResponse.json({ holdings: [] });
  }
}
