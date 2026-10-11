import { NextRequest } from 'next/server';
import { artistIsVisible } from '@/lib/artists/visibility';
import { noStoreJson } from '@/lib/http/noStore';
import { errorResponse, HttpError, requireUserId } from '@/lib/api/requireAuth';
import { adminGetArtistsByIds } from '@/lib/server/artistsAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/**
 * POST /api/artists/batch
 *
 * Get multiple artists by their IDs.
 * Requires Authorization: Bearer. The ss_viewer cookie is ignored.
 *
 * Body:
 * - artistIds: string[] (required)
 */
export async function POST(request: NextRequest) {
  try {
    const viewerId = await requireUserId(request);
    const body = await request.json().catch(() => null);
    const artistIds = body && typeof body === 'object' ? body.artistIds : undefined;

    if (!artistIds || !Array.isArray(artistIds) || artistIds.length === 0) {
      return noStoreJson({ error: 'artistIds array is required' }, 400);
    }

    const artists = (await adminGetArtistsByIds(artistIds)).filter(artist =>
      artistIsVisible(artist, viewerId)
    );

    const serializedArtists = artists.map(artist => ({
      ...artist,
      createdAt: artist.createdAt.toMillis(),
      updatedAt: artist.updatedAt.toMillis(),
      deletedAt: artist.deletedAt ? artist.deletedAt.toMillis() : null,
    }));

    return noStoreJson({
      artists: serializedArtists,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error);
    }
    console.error('[API /artists/batch] Error:', error);

    if (error instanceof Error) {
      return noStoreJson({ error: error.message }, 500);
    }

    return noStoreJson({ error: 'Failed to fetch artists' }, 500);
  }
}
