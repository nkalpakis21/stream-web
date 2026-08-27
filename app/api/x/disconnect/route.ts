import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, HttpError, requireUserId } from '@/lib/api/requireAuth';
import { getArtist } from '@/lib/services/artists';
import { isXConfigured, X_CLIENT_ID_MISSING_MESSAGE } from '@/lib/x/config';
import { emptyXConnection } from '@/types/firestore';
import { getArtistAdmin, updateArtistX } from '@/lib/x/artistStore';
import { deleteXAuth, loadXAuth } from '@/lib/x/tokens';
import { revokeToken } from '@/lib/x/oauth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/x/disconnect
 * Body: { artistId: string }
 * Revokes refresh token, deletes server-only credentials, resets public X state.
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
    const body = (await request.json().catch(() => ({}))) as { artistId?: string };
    const artistId = body.artistId?.trim();
    if (!artistId) {
      throw new HttpError(400, 'artistId is required');
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
      throw new HttpError(403, 'Only the manager of this artist can disconnect X');
    }

    try {
      const stored = await loadXAuth(artistId);
      if (stored?.refreshToken) {
        await revokeToken(stored.refreshToken);
      }
      await deleteXAuth(artistId);
    } catch (err) {
      console.warn('[X] disconnect token cleanup', err);
    }

    await updateArtistX(artistId, emptyXConnection());

    return NextResponse.json({ ok: true, status: 'disconnected' });
  } catch (error) {
    return errorResponse(error);
  }
}
