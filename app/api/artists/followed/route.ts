import { NextRequest } from 'next/server';
import { artistIsVisible } from '@/lib/artists/visibility';
import { noStoreJson } from '@/lib/http/noStore';
import { getFollowedArtists } from '@/lib/services/artists';
import { verifiedViewerIdFromRequest } from '@/lib/server/viewer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/**
 * GET /api/artists/followed
 *
 * Artists the user follows, filtered to ones this viewer may see.
 * Reads may use Authorization or the ss_viewer cookie. Never cached.
 *
 * Query params:
 * - userId: User ID (required)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return noStoreJson({ error: 'User ID is required' }, 400);
    }

    const viewerId = await verifiedViewerIdFromRequest(request);
    const artists = (await getFollowedArtists(userId)).filter(artist =>
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
    console.error('[API /artists/followed] Error:', error);

    if (error instanceof Error) {
      return noStoreJson({ error: error.message }, 500);
    }

    return noStoreJson({ error: 'Failed to fetch followed artists' }, 500);
  }
}
