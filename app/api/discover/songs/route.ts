import { NextRequest, NextResponse } from 'next/server';
import { getPaginatedPublicSongs, searchSongsByPromptPaginated } from '@/lib/services/discovery';
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
      // Search mode
      result = await searchSongsByPromptPaginated(query.trim(), limit, cursor);
    } else {
      // Recent songs mode
      result = await getPaginatedPublicSongs(limit, cursor);
    }

    // Serialize Timestamps for client
    const serializedSongs = result.songs.map(song => ({
      ...song,
      createdAt: song.createdAt.toMillis(),
      updatedAt: song.updatedAt.toMillis(),
      deletedAt: song.deletedAt ? song.deletedAt.toMillis() : null,
    }));

    return NextResponse.json({
      songs: serializedSongs,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error('[API] Error fetching paginated songs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch songs' },
      { status: 500 }
    );
  }
}

