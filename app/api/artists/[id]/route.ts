import { NextRequest } from 'next/server';
import { artistReadResponse } from '@/lib/artists/visibility';
import { noStoreJson } from '@/lib/http/noStore';
import { adminGetArtist } from '@/lib/server/artistsAdmin';
import { verifiedViewerIdFromRequest } from '@/lib/server/viewer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

function millis(value: { toMillis?: () => number } | null | undefined): number | null {
  if (!value || typeof value.toMillis !== 'function') return null;
  return value.toMillis();
}

/**
 * GET /api/artists/[id]
 * Full artist document for the page. 404 unless the artist is public or the
 * verified viewer is the owner. The body of a 404 has no name, bio, or face.
 * Reads may use Authorization or the ss_viewer cookie. Never cached.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const artistId = params.id?.trim();
    if (!artistId) {
      return noStoreJson({ error: 'Artist not found' }, 404);
    }
    const [viewerId, artist] = await Promise.all([
      verifiedViewerIdFromRequest(request),
      adminGetArtist(artistId),
    ]);
    const decision = artistReadResponse(artist, viewerId);
    if (decision.status === 404) {
      return noStoreJson(decision.body, 404);
    }
    const doc = artist!;
    return noStoreJson({
      artist: {
        ...doc,
        id: doc.id || artistId,
        createdAt: millis(doc.createdAt),
        updatedAt: millis(doc.updatedAt),
        deletedAt: millis(doc.deletedAt),
      },
    });
  } catch (error) {
    console.error('[API /artists/[id]] Error:', error);
    return noStoreJson({ error: 'Artist not found' }, 404);
  }
}
