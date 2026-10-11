import { NextRequest } from 'next/server';
import { VIEWER_COOKIE, viewerCookieMaxAge, viewerCookieOptions } from '@/lib/auth/viewerCookie';
import { noStoreJson } from '@/lib/http/noStore';
import { verifyViewerToken } from '@/lib/server/viewer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

function bearerToken(header: string | null): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

/**
 * POST /api/auth/viewer
 * Sets the HttpOnly ss_viewer cookie from a verified ID token.
 * The cookie is for later GET reads. This route ignores any existing cookie.
 */
export async function POST(request: NextRequest) {
  const token = bearerToken(request.headers.get('authorization'));
  if (!token) {
    return noStoreJson({ error: 'Authentication required. Provide Bearer token.' }, 401);
  }

  const verified = await verifyViewerToken(token);
  const maxAge = viewerCookieMaxAge(verified?.exp);
  if (!verified || maxAge <= 0) {
    return noStoreJson({ error: 'Invalid or expired token' }, 401);
  }

  const response = noStoreJson({ ok: true });
  response.cookies.set(VIEWER_COOKIE, token, viewerCookieOptions(maxAge));
  return response;
}

/**
 * DELETE /api/auth/viewer
 * Clears ss_viewer. No token required so sign-out always drops the cookie.
 */
export async function DELETE() {
  const response = noStoreJson({ ok: true });
  response.cookies.set(VIEWER_COOKIE, '', viewerCookieOptions(0));
  return response;
}
