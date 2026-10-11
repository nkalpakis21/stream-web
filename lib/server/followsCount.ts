import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

/** Follower total for the artist page. Null when the read fails so the line can stay reserved. */
export async function adminCountFollowers(artistId: string): Promise<number | null> {
  try {
    const query = getAdminDb().collection(COLLECTIONS.follows).where('artistId', '==', artistId);
    try {
      const snap = await query.count().get();
      const count = snap.data().count;
      return typeof count === 'number' ? count : null;
    } catch {
      const snap = await query.get();
      return snap.size;
    }
  } catch (error) {
    console.error('[follows] count failed', error);
    return null;
  }
}
