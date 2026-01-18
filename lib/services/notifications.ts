/**
 * Notification Service
 *
 * Lightweight in-app notifications backed by Firestore.
 */

import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  updateDoc,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import {
  COLLECTIONS,
  getNotificationPath,
} from '@/lib/firebase/collections';
import type { NotificationDocument } from '@/types/firestore';

/**
 * Create a "song_ready" notification for a user when a generation completes.
 *
 * Idempotent: if a notification with the same (userId, songId, generationId)
 * already exists, it will not create a duplicate.
 */
export async function createSongReadyNotification(params: {
  userId: string;
  songId: string;
  generationId: string;
}): Promise<NotificationDocument | null> {
  const { userId, songId, generationId } = params;

  // Check for existing notification to keep this idempotent
  const existingQuery = query(
    collection(db, COLLECTIONS.notifications),
    where('userId', '==', userId),
    where('songId', '==', songId),
    where('generationId', '==', generationId)
  );

  const existingSnapshot = await getDocs(existingQuery);
  if (!existingSnapshot.empty) {
    return existingSnapshot.docs[0].data() as NotificationDocument;
  }

  const notificationRef = doc(collection(db, COLLECTIONS.notifications));
  const notificationId = notificationRef.id;

  const notification: NotificationDocument = {
    id: notificationId,
    userId,
    songId,
    generationId,
    type: 'song_ready',
    read: false,
    createdAt: Timestamp.now(),
    deletedAt: null,
  };

  await setDoc(notificationRef, notification);
  return notification;
}

/**
 * Get unread notifications for a user, ordered newest first.
 */
export async function getUnreadNotifications(
  userId: string
): Promise<NotificationDocument[]> {
  try {
    const q = query(
      collection(db, COLLECTIONS.notifications),
      where('userId', '==', userId),
      where('read', '==', false),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    // Handle both null and undefined (for older documents without deletedAt field)
    return snapshot.docs
      .map(doc => doc.data() as NotificationDocument)
      .filter(notif => !notif.deletedAt);
  } catch (error: any) {
    // Fallback if composite index doesn't exist
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      console.warn('[getUnreadNotifications] Composite index missing, using fallback');
      
      // Fallback query without orderBy
      const fallbackQuery = query(
        collection(db, COLLECTIONS.notifications),
        where('userId', '==', userId),
        where('read', '==', false)
      );
      
      const snapshot = await getDocs(fallbackQuery);
      const notifications = snapshot.docs
        .map(doc => doc.data() as NotificationDocument)
        .filter(notif => !notif.deletedAt);
      
      // Sort in memory by createdAt descending
      return notifications.sort((a, b) => 
        b.createdAt.toMillis() - a.createdAt.toMillis()
      );
    }
    throw error;
  }
}

/**
 * Get all notifications for a song (used for deletion)
 */
export async function getNotificationsBySong(
  songId: string
): Promise<NotificationDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.notifications),
    where('songId', '==', songId),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  // Handle both null and undefined (for older documents without deletedAt field)
  return snapshot.docs
    .map(doc => doc.data() as NotificationDocument)
    .filter(notif => !notif.deletedAt);
}

/**
 * Create an "artist_new_song" notification for followers when an artist creates a new song.
 * 
 * This should be called when a song is created/completed for an artist.
 * It will create notifications for all users following that artist.
 */
export async function createArtistNewSongNotification(params: {
  artistId: string;
  songId: string;
  generationId: string;
}): Promise<void> {
  const { artistId, songId, generationId } = params;

  // Get all followers of this artist
  const { getFollowers } = await import('./follows');
  const followers = await getFollowers(artistId);

  // Create notifications for each follower
  const notificationPromises = followers.map(follow => {
    return createSongReadyNotification({
      userId: follow.followerId,
      songId,
      generationId,
    }).catch(error => {
      // Log but don't fail if individual notification creation fails
      console.error(`[createArtistNewSongNotification] Failed to create notification for user ${follow.followerId}:`, error);
      return null;
    });
  });

  await Promise.all(notificationPromises);
}

/**
 * Mark a notification as read.
 */
export async function markNotificationRead(
  notificationId: string
): Promise<void> {
  try {
    const ref = doc(db, getNotificationPath(notificationId));
    await updateDoc(ref, { read: true });
  } catch (error: any) {
    console.error('[markNotificationRead] Failed to mark notification as read:', {
      notificationId,
      error: error?.message,
      code: error?.code,
    });
    throw error;
  }
}


