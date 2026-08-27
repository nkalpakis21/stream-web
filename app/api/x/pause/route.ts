import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, HttpError, requireUserId } from '@/lib/api/requireAuth';
import { getArtist } from '@/lib/services/artists';
import { isXConfigured, X_CLIENT_ID_MISSING_MESSAGE } from '@/lib/x/config';
import { firestoreNow, getArtistAdmin, publicXConnection, updateArtistX } from '@/lib/x/artistStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/x/pause
 * Body: { artistId: string, paused: boolean }
 * Pause or resume posting. Does not revoke tokens.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isXConfigured()) {
      return NextResponse.json(
        { error: X_CLIENT_ID_MISSING_MESSAGE, available: false },
        { status: 503 }
      );
    }

    const userId = await requireUserId(request);
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
    if (!artist || artist.deletedAt) {
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

    return NextResponse.json({
      ok: true,
      status: body.paused ? 'paused' : 'connected',
    });
  } catch (error) {
    return errorResponse(error);
  }
}
