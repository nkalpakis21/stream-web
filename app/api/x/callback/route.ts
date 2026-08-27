import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isXConfigured } from '@/lib/x/config';
import { exchangeAuthorizationCode } from '@/lib/x/oauth';
import { verifyOAuthSession } from '@/lib/x/pkce';
import { completeXConnect } from '@/lib/x/completeConnect';
import { getArtistAdmin } from '@/lib/x/artistStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE = 'ss_x_oauth';

function redirectToArtist(
  request: NextRequest,
  artistId: string | null,
  params: Record<string, string>
) {
  const origin = request.nextUrl.origin;
  const path = artistId ? `/artists/${artistId}` : '/dashboard';
  const url = new URL(path, origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = NextResponse.redirect(url);
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}

/**
 * GET /api/x/callback
 *
 * Register this exact path on the X app:
 *   https://streamstar.xyz/api/x/callback
 *   https://www.streamstar.xyz/api/x/callback
 *   https://stream-web-git-develop-nkalpakis.vercel.app/api/x/callback
 *   http://localhost:3000/api/x/callback
 */
export async function GET(request: NextRequest) {
  const artistHint = cookies().get(COOKIE)?.value;
  const session = isXConfigured() ? verifyOAuthSession(artistHint) : null;
  const artistId = session?.artistId ?? null;

  if (!isXConfigured()) {
    return redirectToArtist(request, artistId, {
      x: 'error',
      xMessage: 'X is not configured (X_CLIENT_ID).',
    });
  }

  const error = request.nextUrl.searchParams.get('error');
  if (error) {
    const description =
      request.nextUrl.searchParams.get('error_description') || error;
    return redirectToArtist(request, artistId, {
      x: 'error',
      xMessage: description,
    });
  }

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  if (!code || !state || !session || session.state !== state) {
    return redirectToArtist(request, artistId, {
      x: 'error',
      xMessage: 'X connect failed (invalid or expired OAuth session). Try again.',
    });
  }

  try {
    const tokens = await exchangeAuthorizationCode({
      code,
      verifier: session.verifier,
      request,
    });
    if (!tokens.refreshToken) {
      return redirectToArtist(request, session.artistId, {
        x: 'error',
        xMessage:
          'X did not return a refresh token. Enable offline.access on the X app and try again.',
      });
    }

    const artist = await getArtistAdmin(session.artistId);
    if (!artist || artist.deletedAt) {
      return redirectToArtist(request, session.artistId, {
        x: 'error',
        xMessage: 'Artist not found after X connect.',
      });
    }

    await completeXConnect({
      artistId: session.artistId,
      ownerId: artist.ownerId,
      tokens,
    });

    return redirectToArtist(request, session.artistId, { x: 'connected' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'X connect failed';
    console.error('[X callback]', err);
    return redirectToArtist(request, session.artistId, {
      x: 'error',
      xMessage: message,
    });
  }
}
