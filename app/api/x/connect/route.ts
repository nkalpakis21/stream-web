import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { errorResponse, HttpError, requireUserId } from '@/lib/api/requireAuth';
import { noStoreJson } from '@/lib/http/noStore';
import { artistIsVisible } from '@/lib/artists/visibility';
import { getArtist } from '@/lib/services/artists';
import { isXConfigured, X_CLIENT_ID_MISSING_MESSAGE } from '@/lib/x/config';
import { buildAuthorizeUrl } from '@/lib/x/oauth';
import { signOAuthSession } from '@/lib/x/pkce';
import { getArtistAdmin } from '@/lib/x/artistStore';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

const COOKIE = 'ss_x_oauth';

/**
 * POST /api/x/connect
 * Body: { artistId: string }
 * Starts OAuth 2.0 PKCE as that artist's X account (not a Streamstar company account).
 * Requires Authorization: Bearer. The ss_viewer cookie is ignored.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    if (!isXConfigured()) {
      return noStoreJson(
        { error: X_CLIENT_ID_MISSING_MESSAGE, available: false },
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
      throw new HttpError(403, 'Only the manager of this artist can connect X');
    }

    const { url, session } = buildAuthorizeUrl({
      request,
      artistId,
    });

    const signed = signOAuthSession(session);
    const secure = request.nextUrl.protocol === 'https:';
    cookies().set(COOKIE, signed, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 600,
    });

    return noStoreJson({ authorizeUrl: url, available: true });
  } catch (error) {
    return errorResponse(error);
  }
}
