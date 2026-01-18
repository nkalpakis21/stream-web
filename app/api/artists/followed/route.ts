import { NextRequest, NextResponse } from 'next/server';
import { getFollowedArtists } from '@/lib/services/artists';
import type { AIArtistDocument } from '@/types/firestore';

/**
 * GET /api/artists/followed
 * 
 * Get artists that the current user is following.
 * 
 * Query params:
 * - userId: User ID (required)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const artists = await getFollowedArtists(userId);

    // Serialize Timestamps for client
    const serializedArtists = artists.map(artist => ({
      ...artist,
      createdAt: artist.createdAt.toMillis(),
      updatedAt: artist.updatedAt.toMillis(),
      deletedAt: artist.deletedAt ? artist.deletedAt.toMillis() : null,
    }));

    return NextResponse.json({
      artists: serializedArtists,
    });
  } catch (error) {
    console.error('[API /artists/followed] Error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch followed artists' },
      { status: 500 }
    );
  }
}
