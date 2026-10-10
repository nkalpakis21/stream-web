import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

/**
 * Link a Solana wallet on the authenticated user's document.
 * Creates the user doc when it does not exist yet.
 */
export async function adminUpdateUserSolanaWallet(
  userId: string,
  solanaWalletAddress: string | null,
  userEmail?: string
): Promise<void> {
  const userRef = getAdminDb().collection(COLLECTIONS.users).doc(userId);
  const userDoc = await userRef.get();

  if (userDoc.exists) {
    await userRef.update({
      solanaWalletAddress,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  const now = Timestamp.now();
  await userRef.set({
    email: userEmail || '',
    displayName: null,
    photoURL: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    solanaWalletAddress,
  });
}
