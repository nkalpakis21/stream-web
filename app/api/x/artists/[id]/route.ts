import { NextRequest } from 'next/server';
import { artistIsVisible } from '@/lib/artists/visibility';
import { getArtist } from '@/lib/services/artists';
import { errorResponse, HttpError, requireUserId } from '@/lib/api/requireAuth';
import { noStoreJson } from '@/lib/http/noStore';
import { isXConfigured } from '@/lib/x/config';
import { getArtistAdmin, publicXConnection } from '@/lib/x/artistStore';
import { emptyXConnection, type XPostLogEntry } from '@/types/firestore';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

function serializePost(entry: XPostLogEntry) {
  const createdAt =
    entry.createdAt && typeof entry.createdAt.toMillis === 'function'
      ? entry.createdAt.toMillis()
      : 0;
  return {
    tweetId: entry.tweetId,
    url: entry.url,
    songId: entry.songId,
    songTitle: entry.songTitle,
    text: entry.text,
    createdAt,
  };
}

function serializeTs(value: { toMillis?: () => number } | null | undefined) {
  if (!value) return null;
  if (typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

/**
 * GET /api/x/artists/[id]
 * Owner-only public X connection + activity log. Tokens are never returned.
 * Requires Authorization: Bearer. The ss_viewer cookie is ignored.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId(request);
    const available = isXConfigured();
    if (!available) {
      return noStoreJson({
        available: false,
        x: emptyXConnection(),
      });
    }
    const artistId = params.id;

    let artist;
    try {
      artist = await getArtistAdmin(artistId);
    } catch {
      artist = await getArtist(artistId);
    }

    if (!artistIsVisible(artist, userId)) {
      throw new HttpError(404, 'Artist not found');
    }
    if (artist.ownerId !== userId) {
      throw new HttpError(403, 'Only the manager of this artist can view X settings');
    }

    const x = publicXConnection(artist);
    return noStoreJson({
      available: true,
      message: null,
      x: {
        status: x.status,
        username: x.username,
        userId: x.userId,
        connectedAt: serializeTs(x.connectedAt),
        pausedAt: serializeTs(x.pausedAt),
        lastError: x.lastError,
        lastErrorAt: serializeTs(x.lastErrorAt),
        profileSyncedAt: serializeTs(x.profileSyncedAt),
        posts: (x.posts || []).map(serializePost),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
