/**
 * Recent-login check for DELETE /api/account only.
 * Not lib/server/auth.ts: the route-hardening PR owns requireUser there.
 */

import { NextRequest } from 'next/server';
import * as admin from 'firebase-admin';
import { isFirebaseAdminConfigured } from '@/lib/firebase/admin';
import { hasAppleProvider } from '@/lib/server/appleRevoke';

/** Mobile re-authenticates, then calls delete within this window. */
export const RECENT_LOGIN_WINDOW_SECONDS = 5 * 60;

export class AccountAuthError extends Error {
  readonly status = 401;

  constructor(readonly code: 'unauthorized' | 'requires-recent-login') {
    super(code);
    this.name = 'AccountAuthError';
  }
}

export function isRecentSignIn(authTimeSeconds: number, nowSeconds: number): boolean {
  return nowSeconds - authTimeSeconds <= RECENT_LOGIN_WINDOW_SECONDS;
}

/**
 * Bearer Firebase ID token, checked for revocation.
 * uid comes only from the verified token.
 */
export async function requireRecentAccountUser(
  request: NextRequest
): Promise<{ uid: string; email: string | null; appleLinked: boolean }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AccountAuthError('unauthorized');
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new AccountAuthError('unauthorized');
  }

  if (!isFirebaseAdminConfigured()) {
    throw Object.assign(new Error('admin-unavailable'), { code: 'admin-unavailable' });
  }

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await admin.auth().verifyIdToken(token, true);
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: unknown }).code)
        : 'invalid';
    console.error('[account] token verification failed', code);
    throw new AccountAuthError('unauthorized');
  }

  if (!decoded.uid) {
    throw new AccountAuthError('unauthorized');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    typeof decoded.auth_time !== 'number' ||
    !isRecentSignIn(decoded.auth_time, nowSeconds)
  ) {
    throw new AccountAuthError('requires-recent-login');
  }

  const email =
    typeof decoded.email === 'string' && decoded.email.includes('@')
      ? decoded.email
      : null;
  const appleLinked = hasAppleProvider({
    signInProvider: decoded.firebase?.sign_in_provider,
    identities: decoded.firebase?.identities,
  });
  return { uid: decoded.uid, email, appleLinked };
}
