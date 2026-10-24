/**
 * DELETE /api/account
 *
 * Authorization: Bearer <Firebase ID token>
 * The token is verified with checkRevoked (`verifyIdToken(token, true)`).
 * auth_time is not checked.
 * Optional JSON body for Apple-linked users:
 * `{ "appleAuthorizationCode": "<fresh Sign in with Apple code>" }`
 *
 * When the Firebase user has the apple.com provider, the code is exchanged
 * and the refresh token is revoked before the account is deleted. The JSON
 * then includes `appleRevoke`: "revoked", "skipped", or "failed". A missing
 * code, missing Apple env, or an Apple request failure does not block
 * deletion. Other users still receive `{ ok: true }`.
 *
 * Native clients call this the same way as the other Bearer routes
 * (no browser CORS headers).
 */

import { NextRequest, NextResponse } from 'next/server';
import { isFirebaseAdminInitError } from '@/lib/firebase/admin';
import { AccountAuthError, requireAccountUser } from '@/lib/server/accountAuth';
import {
  appleAuthorizationCodeFromBody,
  revokeAppleOnAccountDeletion,
} from '@/lib/server/appleRevoke';
import { deleteAccount } from '@/lib/server/deleteAccount';

type DeleteAccountFn = (uid: string, email: string | null) => Promise<void>;

let deleteAccountForTests: DeleteAccountFn | null = null;

/** Test-only. Production requests always call `deleteAccount`. */
export function setDeleteAccountForTests(fn: DeleteAccountFn | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setDeleteAccountForTests is disabled in production');
  }
  deleteAccountForTests = fn;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';
export const maxDuration = 300;

function failureCode(error: unknown): string {
  if (isFirebaseAdminInitError(error)) return 'admin-unavailable';
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'admin-unavailable') return 'admin-unavailable';
  }
  return 'delete-failed';
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAccountUser(request);
    const authorizationCode = user.appleLinked
      ? appleAuthorizationCodeFromBody(await request.text().catch(() => ''))
      : null;
    const appleRevoke = await revokeAppleOnAccountDeletion({
      appleLinked: user.appleLinked,
      authorizationCode,
    });
    const removeAccount =
      process.env.NODE_ENV !== 'production' && deleteAccountForTests
        ? deleteAccountForTests
        : deleteAccount;
    await removeAccount(user.uid, user.email);
    return NextResponse.json(appleRevoke ? { ok: true, appleRevoke } : { ok: true });
  } catch (error) {
    if (error instanceof AccountAuthError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    console.error('[account] delete failed', error);
    return NextResponse.json({ error: failureCode(error) }, { status: 500 });
  }
}
