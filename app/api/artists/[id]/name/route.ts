import { NextRequest, NextResponse } from 'next/server';
import { updateArtistName, getArtist } from '@/lib/services/artists';
import { errorResponse, HttpError, requireUserId } from '@/lib/api/requireAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * PATCH /api/artists/[id]/name
 *
 * Update an artist's name.
 * Requires a verified Firebase ID token (Authorization: Bearer) and ownership.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId(request);
    const artistId = params.id;
    const body = await request.json().catch(() => ({}));
    const { name } = body as { name?: unknown };

    if (!name || typeof name !== 'string') {
      throw new HttpError(400, 'Name is required and must be a string');
    }

    const artist = await getArtist(artistId);
    if (!artist) {
      throw new HttpError(404, 'Artist not found');
    }

    if (artist.ownerId !== userId) {
      throw new HttpError(403, 'Only the owner can update the artist name');
    }

    const updatedArtist = await updateArtistName(artistId, userId, name);

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
    if (error instanceof HttpError) {
      return errorResponse(error);
    }

    console.error('[API /artists/[id]/name] Error:', error);

    if (error instanceof Error) {
      if (error.message.includes('already taken')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (error.message.includes('must be') || error.message.includes('can only contain')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: 'Failed to update artist name' }, { status: 500 });
  }
}
