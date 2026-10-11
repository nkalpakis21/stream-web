import { cookies, headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { VIEWER_COOKIE, viewerTokenFromCookie } from '@/lib/auth/viewerCookie';
import { isFirebaseAdminConfigured, verifyIdToken } from '@/lib/firebase/admin';

export interface VerifiedViewerToken {
  uid: string;
  exp: number;
}

type ViewerTokenVerifier = (
  token: string
) => Promise<{ uid?: string; exp?: number } | null>;

let viewerVerifierForTests: ViewerTokenVerifier | null = null;

/** Test-only. Production requests always use Firebase Admin verifyIdToken. */
export function setViewerVerifierForTests(verifier: ViewerTokenVerifier | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setViewerVerifierForTests is disabled in production');
  }
  viewerVerifierForTests = verifier;
}

function bearerToken(header: string | null): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

/**
 * Verify an ID token. Missing or invalid tokens are signed-out.
 * Never throw. Never log the token.
 */
export async function verifyViewerToken(token: string | null): Promise<VerifiedViewerToken | null> {
  if (!token) return null;
  if (process.env.NODE_ENV !== 'production' && viewerVerifierForTests) {
    try {
      const decoded = await viewerVerifierForTests(token);
      if (!decoded?.uid) return null;
      return {
        uid: decoded.uid,
        exp: typeof decoded.exp === 'number' ? decoded.exp : 0,
      };
    } catch {
      return null;
    }
  }
  if (!isFirebaseAdminConfigured()) return null;
  try {
    const decoded = await verifyIdToken(token);
    if (!decoded.uid) return null;
    return { uid: decoded.uid, exp: decoded.exp };
  } catch {
    console.error('[viewer] Firebase ID token rejected');
    return null;
  }
}

/** Missing or invalid tokens are signed-out. Never throw, never log the token. */
export async function uidFromVerifiedToken(token: string | null): Promise<string | null> {
  const verified = await verifyViewerToken(token);
  return verified?.uid ?? null;
}

/**
 * Reads may use Authorization or the ss_viewer cookie.
 * Mutations must call requireUserId and ignore this helper.
 */
export async function verifiedViewerIdFromRequest(request: NextRequest): Promise<string | null> {
  const fromHeader = bearerToken(request.headers.get('authorization'));
  const fromCookie = viewerTokenFromCookie(request.cookies.get(VIEWER_COOKIE)?.value);
  return uidFromVerifiedToken(fromHeader || fromCookie);
}

export async function verifiedViewerIdFromPage(): Promise<string | null> {
  const fromHeader = bearerToken(headers().get('authorization'));
  const fromCookie = viewerTokenFromCookie(cookies().get(VIEWER_COOKIE)?.value);
  return uidFromVerifiedToken(fromHeader || fromCookie);
}
