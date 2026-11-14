import { NextRequest } from 'next/server';
import { errorResponse, HttpError, requireUserId } from '@/lib/api/requireAuth';
import { noStoreJson } from '@/lib/http/noStore';
import { artistIsVisible } from '@/lib/artists/visibility';
import { getArtist } from '@/lib/services/artists';
import { isXConfigured } from '@/lib/x/config';
import { firestoreNow, getArtistAdmin, publicXConnection, updateArtistX } from '@/lib/x/artistStore';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/**
 * POST /api/x/pause
 * Body: { artistId: string, paused: boolean }
 * Pause or resume posting. Does not revoke tokens.
 * Requires Authorization: Bearer. The ss_viewer cookie is ignored.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    if (!isXConfigured()) {
      return noStoreJson(
        { available: false },
        503
      );
    }
    const body = (await request.json().catch(() => ({}))) as {
      artistId?: string;
      paused?: boolean;
    };
    const artistId = body.artistId?.trim();
    if (!artistId || typeof body.paused !== 'boolean') {
      throw new HttpError(400, 'artistId and paused are required');
    }

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
      throw new HttpError(403, 'Only the manager of this artist can pause X');
    }

    const x = publicXConnection(artist);
    if (x.status === 'disconnected' || !x.username) {
      throw new HttpError(400, 'Connect X before pausing or resuming');
    }

    if (body.paused) {
      await updateArtistX(artistId, {
        status: 'paused',
        pausedAt: firestoreNow(),
      });
    } else {
      await updateArtistX(artistId, {
        status: 'connected',
        pausedAt: null,
        lastError: null,
        lastErrorAt: null,
      });
    }

    return noStoreJson({
      ok: true,
      status: body.paused ? 'paused' : 'connected',
    });
  } catch (error) {
    return errorResponse(error);
  }
}
