import { NextRequest } from 'next/server';
import { artistIsVisible } from '@/lib/artists/visibility';
import { noStoreJson } from '@/lib/http/noStore';
import { adminGetArtist, adminUpdateArtistName } from '@/lib/server/artistsAdmin';
import { errorResponse, HttpError, requireUserId } from '@/lib/api/requireAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/**
 * PATCH /api/artists/[id]/name
 *
 * Update an artist's name.
 * Requires Authorization: Bearer and ownership. The ss_viewer cookie is ignored.
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

    const artist = await adminGetArtist(artistId);
    if (!artistIsVisible(artist, userId)) {
      throw new HttpError(404, 'Artist not found');
    }

    if (artist.ownerId !== userId) {
      throw new HttpError(403, 'Only the owner can update the artist name');
    }

    const updatedArtist = await adminUpdateArtistName(artistId, userId, name);

    const serialized = {
      ...updatedArtist,
      createdAt: updatedArtist.createdAt.toMillis(),
      updatedAt: updatedArtist.updatedAt.toMillis(),
      deletedAt: updatedArtist.deletedAt ? updatedArtist.deletedAt.toMillis() : null,
    };

    return noStoreJson({
      artist: serialized,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error);
    }

    console.error('[API /artists/[id]/name] Error:', error);

    if (error instanceof Error) {
      if (error.message.includes('already taken')) {
        return noStoreJson({ error: error.message }, 409);
      }
      if (error.message.includes('must be') || error.message.includes('can only contain')) {
        return noStoreJson({ error: error.message }, 400);
      }
      return noStoreJson({ error: error.message }, 500);
    }

    return noStoreJson({ error: 'Failed to update artist name' }, 500);
  }
}
