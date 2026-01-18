import { NextRequest, NextResponse } from 'next/server';
import { updateArtistName, getArtist } from '@/lib/services/artists';
import type { AIArtistDocument } from '@/types/firestore';

/**
 * PATCH /api/artists/[id]/name
 * 
 * Update an artist's name.
 * 
 * Body:
 * - name: string (required) - New artist name
 * 
 * Requires authentication and ownership of the artist.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const artistId = params.id;
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Name is required and must be a string' },
        { status: 400 }
      );
    }

    // Get auth token from headers (you may need to adjust this based on your auth setup)
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // For now, we'll get userId from a custom header or query param
    // In production, you'd decode the auth token
    const userId = request.headers.get('x-user-id') || request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 401 }
      );
    }

    // Verify ownership
    const artist = await getArtist(artistId);
    if (!artist) {
      return NextResponse.json(
        { error: 'Artist not found' },
        { status: 404 }
      );
    }

    if (artist.ownerId !== userId) {
      return NextResponse.json(
        { error: 'Only the owner can update the artist name' },
        { status: 403 }
      );
    }

    // Update the artist name
    const updatedArtist = await updateArtistName(artistId, userId, name);

    // Serialize Timestamps for client
    const serialized = {
      ...updatedArtist,
      createdAt: updatedArtist.createdAt.toMillis(),
      updatedAt: updatedArtist.updatedAt.toMillis(),
      deletedAt: updatedArtist.deletedAt ? updatedArtist.deletedAt.toMillis() : null,
    };

    return NextResponse.json({
      artist: serialized,
    });
  } catch (error) {
    console.error('[API /artists/[id]/name] Error:', error);
    
    if (error instanceof Error) {
      // Check for specific error messages
      if (error.message.includes('already taken')) {
        return NextResponse.json(
          { error: error.message },
          { status: 409 } // Conflict
        );
      }
      if (error.message.includes('must be') || error.message.includes('can only contain')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update artist name' },
      { status: 500 }
    );
  }
}
