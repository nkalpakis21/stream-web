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
  const q = query(
    collection(db, COLLECTIONS.notifications),
    where('userId', '==', userId),
    where('read', '==', false),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as NotificationDocument);
}

/**
 * Mark a notification as read.
 */
export async function markNotificationRead(
  notificationId: string
): Promise<void> {
  const ref = doc(db, getNotificationPath(notificationId));
  await updateDoc(ref, { read: true });
}


