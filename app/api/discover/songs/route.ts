import { NextRequest, NextResponse } from 'next/server';
import { getPaginatedPublicSongs, searchSongsByPromptPaginated } from '@/lib/services/discovery';
import { getTopSongs } from '@/lib/services/songs';
import { displaysRecord, getArtistCardContext } from '@/lib/server/artistDisplay';
import { fetchCoinQuotes } from '@/lib/solana/fetchCoinQuotes';
import type { ArtistCardDisplay } from '@/lib/artists/cardDisplay';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import type { SongDocument } from '@/types/firestore';

/**
 * GET /api/discover/songs
 * 
 * Paginated endpoint for discovering songs with infinite scroll support.
 * 
 * Query params:
 * - limit: number of songs per page (default: 20)
 * - cursor: last document ID for pagination (optional)
 * - query: search query string (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const cursor = searchParams.get('cursor') || null;
    const query = searchParams.get('query') || null;
    const sort = searchParams.get('sort') === 'heat' ? 'heat' : 'new';

    // Validate limit
    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Limit must be between 1 and 100' },
        { status: 400 }
      );
    }

    let result: {
      songs: SongDocument[];
      nextCursor: string | null;
      hasMore: boolean;
    };

    if (query && query.trim()) {
      // Search mode — STR-27 owns search matching; do not expand it here.
      result = await searchSongsByPromptPaginated(query.trim(), limit, cursor);
    } else if (sort === 'heat') {
      const songs = await getTopSongs(limit);
      result = { songs, nextCursor: null, hasMore: false };
    } else {
      result = await getPaginatedPublicSongs(limit, cursor);
    }

    // Serialize Timestamps for client
    const serializedSongs = result.songs.map(song => ({
      ...song,
      createdAt: song.createdAt.toMillis(),
      updatedAt: song.updatedAt.toMillis(),
      deletedAt: song.deletedAt ? song.deletedAt.toMillis() : null,
    }));

    const { displays, coins } = await getArtistCardContext(result.songs.map(song => song.artistId));
    const mints = [...coins.values()]
      .map(coin => coin.mint)
      .filter((mint): mint is string => Boolean(mint));
    const quotes = await fetchCoinQuotes(mints);
    const artists: Record<string, ArtistCardDisplay> = displaysRecord(displays);
    const artistCoins: Record<
      string,
      { ticker: string | null; coinIcon: string | null; quote: ArtistCoinQuote | null }
    > = {};
    displays.forEach((_display, id) => {
      const coin = coins.get(id);
      artistCoins[id] = {
        ticker: coin?.ticker ?? null,
        coinIcon: coin?.coinIcon ?? null,
        quote: coin?.mint ? quotes.get(coin.mint) ?? null : null,
      };
    });

    return NextResponse.json({
      songs: serializedSongs,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      artists,
      artistCoins,
    });
  } catch (error) {
    console.error('[API] Error fetching paginated songs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch songs' },
      { status: 500 }
    );
  }
}

