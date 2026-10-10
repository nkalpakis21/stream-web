import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type { FollowDocument, NotificationDocument } from '@/types/firestore';
import { isMissingIndexError } from '@/lib/server/indexError';

export async function adminCreateSongReadyNotification(params: {
  userId: string;
  songId: string;
  generationId: string;
}): Promise<NotificationDocument | null> {
  const { userId, songId, generationId } = params;
  const db = getAdminDb();
  const existing = await db
    .collection(COLLECTIONS.notifications)
    .where('userId', '==', userId)
    .where('songId', '==', songId)
    .where('generationId', '==', generationId)
    .get();
  if (!existing.empty) {
    return existing.docs[0].data() as NotificationDocument;
  }

  const notificationRef = db.collection(COLLECTIONS.notifications).doc();
  const notification = {
    id: notificationRef.id,
    userId,
    songId,
    generationId,
    type: 'song_ready',
    read: false,
    createdAt: Timestamp.now(),
    deletedAt: null,
  };
  await notificationRef.set(notification);
  return notification as unknown as NotificationDocument;
}

async function adminGetFollowers(artistId: string, limitCount = 100): Promise<FollowDocument[]> {
  const collection = getAdminDb().collection(COLLECTIONS.follows);
  try {
    const snap = await collection
      .where('artistId', '==', artistId)
      .orderBy('createdAt', 'desc')
      .limit(limitCount)
      .get();
    return snap.docs.map((doc) => doc.data() as FollowDocument);
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    console.warn('[adminGetFollowers] Composite index missing, using fallback');
    const snap = await collection.where('artistId', '==', artistId).get();
    return snap.docs
      .map((doc) => doc.data() as FollowDocument)
      .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
      .slice(0, limitCount);
  }
}

export async function adminCreateArtistNewSongNotification(params: {
  artistId: string;
  songId: string;
  generationId: string;
}): Promise<void> {
  const followers = await adminGetFollowers(params.artistId);
  await Promise.all(
    followers.map((follow) =>
      adminCreateSongReadyNotification({
        userId: follow.followerId,
        songId: params.songId,
        generationId: params.generationId,
      }).catch((error) => {
        console.error(
          `[adminCreateArtistNewSongNotification] Failed to create notification for user ${follow.followerId}:`,
          error
        );
        return null;
      })
    )
  );
}
