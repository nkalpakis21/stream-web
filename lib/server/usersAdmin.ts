import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

/**
 * Link a Solana wallet on the authenticated user's private profile.
 * email and solanaWalletAddress are not written to the public user document.
 * Creates the public user doc when it does not exist yet.
 */
export async function adminUpdateUserSolanaWallet(
  userId: string,
  solanaWalletAddress: string | null,
  userEmail?: string
): Promise<void> {
  const userRef = getAdminDb().collection(COLLECTIONS.users).doc(userId);
  const privateRef = userRef.collection('private').doc('profile');
  const userDoc = await userRef.get();

  const privatePayload: { solanaWalletAddress: string | null; email?: string } = {
    solanaWalletAddress,
  };
  if (userEmail) {
    privatePayload.email = userEmail;
  } else if (userDoc.exists) {
    const storedEmail = userDoc.get('email');
    if (typeof storedEmail === 'string' && storedEmail) {
      privatePayload.email = storedEmail;
    }
  }

  await privateRef.set(privatePayload, { merge: true });

  if (userDoc.exists) {
    await userRef.update({
      updatedAt: FieldValue.serverTimestamp(),
      email: FieldValue.delete(),
      solanaWalletAddress: FieldValue.delete(),
    });
    return;
  }

  const now = Timestamp.now();
  await userRef.set({
    displayName: null,
    photoURL: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
}
