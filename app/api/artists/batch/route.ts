import { NextRequest, NextResponse } from 'next/server';
import { getArtistsByIds } from '@/lib/services/artists';
import type { AIArtistDocument } from '@/types/firestore';

/**
 * POST /api/artists/batch
 * 
 * Get multiple artists by their IDs.
 * 
 * Body:
 * - artistIds: string[] (required)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { artistIds } = body;

    if (!artistIds || !Array.isArray(artistIds) || artistIds.length === 0) {
      return NextResponse.json(
        { error: 'artistIds array is required' },
        { status: 400 }
      );
    }

    const artists = await getArtistsByIds(artistIds);

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
    console.error('[API /artists/batch] Error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch artists' },
      { status: 500 }
    );
  }
}
