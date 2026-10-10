import { NextRequest, NextResponse } from 'next/server';
import { applyNoStore } from '@/lib/http/noStore';
import {
  isFirebaseAdminConfigured,
  isFirebaseAdminInitError,
  verifyIdToken,
} from '@/lib/firebase/admin';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

const ADMIN_UNAVAILABLE_MESSAGE = 'Temporarily unavailable';

type TokenVerifier = (idToken: string) => Promise<{ uid: string }>;

/**
 * Read `Authorization: Bearer <Firebase ID token>`, verify it, and return
 * the uid from the decoded token. Never accept a uid from the body or query.
 *
 * Canonical helper for server routes, including a later `DELETE /api/account`.
 * `lib/api/requireAuth.ts` re-exports this module.
 *
 * `verifyToken` is for tests. Routes should call this with the request only.
 */
export async function requireUser(
  request: NextRequest,
  options?: { unavailableMessage?: string; verifyToken?: TokenVerifier }
): Promise<string> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Authentication required. Provide Bearer token.');
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    throw new HttpError(401, 'Authentication required. Provide Bearer token.');
  }

  const unavailableMessage = options?.unavailableMessage ?? ADMIN_UNAVAILABLE_MESSAGE;
  if (!options?.verifyToken && !isFirebaseAdminConfigured()) {
    console.error('[auth] Firebase Admin is not initialized');
    throw new HttpError(503, unavailableMessage);
  }

  try {
    const decoded = options?.verifyToken
      ? await options.verifyToken(idToken)
      : await verifyIdToken(idToken);
    if (!decoded?.uid) {
      throw new HttpError(401, 'Invalid or expired token');
    }
    return decoded.uid;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (isFirebaseAdminInitError(err)) {
      console.error('[auth] Firebase Admin is not initialized:', err);
      throw new HttpError(503, unavailableMessage);
    }
    console.error('[auth] Token verification failed:', err);
    throw new HttpError(401, 'Invalid or expired token');
  }
}

export async function requireUserId(
  request: NextRequest,
  options?: { unavailableMessage?: string }
): Promise<string> {
  return requireUser(request, options);
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return applyNoStore(
      NextResponse.json({ error: error.message }, { status: error.status })
    );
  }
  if (isFirebaseAdminInitError(error)) {
    console.error('[auth] Firebase Admin is not initialized:', error);
    return applyNoStore(
      NextResponse.json(
        { error: ADMIN_UNAVAILABLE_MESSAGE },
        { status: 503 }
      )
    );
  }
  const message = error instanceof Error ? error.message : 'Internal error';
  console.error('[API]', error);
  return applyNoStore(NextResponse.json({ error: message }, { status: 500 }));
}
