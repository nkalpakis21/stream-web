/**
 * Test seam for DELETE /api/account. The route module cannot export this:
 * Next.js rejects extra route exports at build time.
 * Production requests always call `deleteAccount`.
 */

import { deleteAccount } from '@/lib/server/deleteAccount';

type DeleteAccountFn = (uid: string, email: string | null) => Promise<void>;

let deleteAccountForTests: DeleteAccountFn | null = null;

export function setDeleteAccountForTests(fn: DeleteAccountFn | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setDeleteAccountForTests is disabled in production');
  }
  deleteAccountForTests = fn;
}

export function deleteAccountForRequest(uid: string, email: string | null): Promise<void> {
  if (process.env.NODE_ENV !== 'production' && deleteAccountForTests) {
    return deleteAccountForTests(uid, email);
  }
  return deleteAccount(uid, email);
}
