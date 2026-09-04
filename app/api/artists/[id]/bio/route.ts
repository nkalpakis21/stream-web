import { NextRequest, NextResponse } from 'next/server';
import { updateArtistLore, getArtist } from '@/lib/services/artists';
import { MAX_ARTIST_BIO_LENGTH } from '@/lib/brand/bio';
import { errorResponse, HttpError, requireUserId } from '@/lib/api/requireAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * PATCH /api/artists/[id]/bio
 *
 * Update an artist's bio (`lore`). Owner-only. Empty clears the bio.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId(request);
    const artistId = params.id;
    const body = await request.json().catch(() => ({}));
    const { bio } = body as { bio?: unknown };

    if (typeof bio !== 'string') {
      throw new HttpError(400, 'Bio is required and must be a string');
    }

    if (bio.trim().length > MAX_ARTIST_BIO_LENGTH) {
      throw new HttpError(
        400,
        `Bio must be ${MAX_ARTIST_BIO_LENGTH} characters or less`
      );
    }

    const artist = await getArtist(artistId);
    if (!artist) {
      throw new HttpError(404, 'Artist not found');
    }

    if (artist.ownerId !== userId) {
      throw new HttpError(403, 'Only the owner can update the artist bio');
    }

    const updatedArtist = await updateArtistLore(artistId, userId, bio);

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

    console.error('[API /artists/[id]/bio] Error:', error);

    if (error instanceof Error) {
      if (error.message.includes('must be')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: 'Failed to update artist bio' }, { status: 500 });
  }
}
