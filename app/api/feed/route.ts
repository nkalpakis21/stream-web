import { NextRequest, NextResponse } from 'next/server';
import { getFollowedArtistsSongs } from '@/lib/services/feed';
import type { SongDocument } from '@/types/firestore';

/**
 * GET /api/feed
 * 
 * Paginated endpoint for user's feed (songs from followed artists).
 * Requires userId query parameter.
 * 
 * Query params:
 * - userId: User ID (required)
 * - limit: number of songs per page (default: 20)
 * - cursor: last document ID for pagination (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const cursor = searchParams.get('cursor') || null;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Validate limit
    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Limit must be between 1 and 100' },
        { status: 400 }
      );
    }

    const result = await getFollowedArtistsSongs(userId, limit, cursor);

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
    console.error('[API /feed] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feed' },
      { status: 500 }
    );
  }
}
