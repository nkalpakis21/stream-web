import { NextRequest, NextResponse } from 'next/server';
import { getArtist } from '@/lib/services/artists';
import { errorResponse, HttpError, requireUserId } from '@/lib/api/requireAuth';
import { isXConfigured, X_CLIENT_ID_MISSING_MESSAGE } from '@/lib/x/config';
import { getArtistAdmin, publicXConnection } from '@/lib/x/artistStore';
import { emptyXConnection, type XPostLogEntry } from '@/types/firestore';

export const dynamic = 'force-dynamic';
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
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const available = isXConfigured();
    if (!available) {
      return NextResponse.json({
        available: false,
        message: X_CLIENT_ID_MISSING_MESSAGE,
        x: emptyXConnection(),
      });
    }

    const userId = await requireUserId(request);
    const artistId = params.id;

    let artist;
    try {
      artist = await getArtistAdmin(artistId);
    } catch {
      artist = await getArtist(artistId);
    }

    if (!artist || artist.deletedAt) {
      throw new HttpError(404, 'Artist not found');
    }
    if (artist.ownerId !== userId) {
      throw new HttpError(403, 'Only the manager of this artist can view X settings');
    }

    const x = publicXConnection(artist);
    return NextResponse.json({
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
