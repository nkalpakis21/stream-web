import { NextRequest, NextResponse } from 'next/server';
import { searchArtistsByName } from '@/lib/services/artists';
import type { AIArtistDocument } from '@/types/firestore';

/**
 * GET /api/artists/search
 * 
 * Search artists by name (prefix matching, case-insensitive).
 * 
 * Query params:
 * - query: Artist name search string (required, min 1 char)
 * - limit: Max results (default: 20, max: 50)
 * - excludeOwnerId: Owner ID to exclude from results (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');
    const limitParam = searchParams.get('limit');
    const excludeOwnerId = searchParams.get('excludeOwnerId') || undefined;

    // Validate query
    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query parameter is required and must be at least 1 character' },
        { status: 400 }
      );
    }

    // Validate and parse limit
    let limitCount = 20;
    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 50) {
        return NextResponse.json(
          { error: 'Limit must be a number between 1 and 50' },
          { status: 400 }
        );
      }
      limitCount = parsed;
    }

    // Search artists
    const artists = await searchArtistsByName(query.trim(), excludeOwnerId, limitCount);

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
    console.error('[API /artists/search] Error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to search artists' },
      { status: 500 }
    );
  }
}
