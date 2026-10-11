import { NextRequest } from 'next/server';
import { errorResponse, HttpError, requireUserId } from '@/lib/api/requireAuth';
import { noStoreJson } from '@/lib/http/noStore';
import { artistIsVisible } from '@/lib/artists/visibility';
import { getArtist } from '@/lib/services/artists';
import { isXConfigured } from '@/lib/x/config';
import { emptyXConnection } from '@/types/firestore';
import { getArtistAdmin, updateArtistX } from '@/lib/x/artistStore';
import { deleteXAuth, loadXAuth } from '@/lib/x/tokens';
import { revokeToken } from '@/lib/x/oauth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/**
 * POST /api/x/disconnect
 * Body: { artistId: string }
 * Revokes refresh token, deletes server-only credentials, resets public X state.
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
    if (!artistIsVisible(artist, userId)) {
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

    return noStoreJson({ ok: true, status: 'disconnected' });
  } catch (error) {
    return errorResponse(error);
  }
}
