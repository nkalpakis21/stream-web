/**
 * Firebase ID token check for DELETE /api/account.
 * Not lib/server/auth.ts: the route-hardening PR owns requireUser there.
 *
 * `requireAccountUser` is what account deletion calls. It verifies the token
 * with checkRevoked and does not look at auth_time.
 * `requireRecentAccountUser` is the same check plus a 5-minute auth_time
 * window, for any other caller that still wants a fresh sign-in.
 */

import { NextRequest } from 'next/server';
import * as admin from 'firebase-admin';
import { isFirebaseAdminConfigured } from '@/lib/firebase/admin';
import { hasAppleProvider } from '@/lib/server/appleRevoke';

/** Fresh-sign-in window for callers of `requireRecentAccountUser`. */
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

export type AccountUser = {
  uid: string;
  email: string | null;
  appleLinked: boolean;
};

type DecodedAccountToken = {
  uid?: string;
  email?: unknown;
  auth_time?: unknown;
  firebase?: {
    sign_in_provider?: string;
    identities?: unknown;
  };
};

type AccountTokenVerifier = (
  token: string,
  checkRevoked: boolean
) => Promise<DecodedAccountToken>;

let accountTokenVerifierForTests: AccountTokenVerifier | null = null;

/** Test-only. Production requests always use Firebase Admin verifyIdToken. */
export function setAccountTokenVerifierForTests(verifier: AccountTokenVerifier | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setAccountTokenVerifierForTests is disabled in production');
  }
  accountTokenVerifierForTests = verifier;
}

function bearerToken(request: NextRequest): string {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AccountAuthError('unauthorized');
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new AccountAuthError('unauthorized');
  }
  return token;
}

async function verifiedAccountToken(request: NextRequest): Promise<DecodedAccountToken> {
  const token = bearerToken(request);
  const usingTestVerifier =
    process.env.NODE_ENV !== 'production' && accountTokenVerifierForTests != null;
  if (!usingTestVerifier && !isFirebaseAdminConfigured()) {
    throw Object.assign(new Error('admin-unavailable'), { code: 'admin-unavailable' });
  }

  let decoded: DecodedAccountToken;
  try {
    if (usingTestVerifier && accountTokenVerifierForTests) {
      decoded = await accountTokenVerifierForTests(token, true);
    } else {
      decoded = await admin.auth().verifyIdToken(token, true);
    }
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
  return decoded;
}

function accountUserFromToken(decoded: DecodedAccountToken): AccountUser {
  const email =
    typeof decoded.email === 'string' && decoded.email.includes('@')
      ? decoded.email
      : null;
  const appleLinked = hasAppleProvider({
    signInProvider: decoded.firebase?.sign_in_provider,
    identities: decoded.firebase?.identities,
  });
  return { uid: decoded.uid as string, email, appleLinked };
}

/**
 * Bearer Firebase ID token, checked for revocation.
 * uid comes only from the verified token. auth_time is ignored.
 */
export async function requireAccountUser(request: NextRequest): Promise<AccountUser> {
  const decoded = await verifiedAccountToken(request);
  return accountUserFromToken(decoded);
}

/**
 * `requireAccountUser`, then reject when auth_time is missing or older than
 * `RECENT_LOGIN_WINDOW_SECONDS`. DELETE /api/account does not call this.
 */
export async function requireRecentAccountUser(request: NextRequest): Promise<AccountUser> {
  const decoded = await verifiedAccountToken(request);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    typeof decoded.auth_time !== 'number' ||
    !isRecentSignIn(decoded.auth_time, nowSeconds)
  ) {
    throw new AccountAuthError('requires-recent-login');
  }
  return accountUserFromToken(decoded);
}
