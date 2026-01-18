/**
 * Follow Service
 * 
 * Handles following/unfollowing artists and querying follow relationships.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import {
  COLLECTIONS,
  getFollowPath,
} from '@/lib/firebase/collections';
import type { FollowDocument } from '@/types/firestore';

/**
 * Follow an artist
 */
export async function followArtist(
  userId: string,
  artistId: string
): Promise<FollowDocument> {
  // Get artist to check ownership
  const { getArtist } = await import('./artists');
  const artist = await getArtist(artistId);
  
  if (!artist) {
    throw new Error('Artist not found');
  }
  
  // Prevent users from following their own artists
  if (artist.ownerId === userId) {
    throw new Error('You cannot follow your own artist');
  }
  
  // Check if already following
  const existingFollow = await isFollowing(userId, artistId);
  if (existingFollow) {
    return existingFollow;
  }

  const followRef = doc(collection(db, COLLECTIONS.follows));
  const followId = followRef.id;

  const follow: FollowDocument = {
    id: followId,
    followerId: userId,
    artistId,
    createdAt: Timestamp.now(),
  };

  await setDoc(followRef, follow);
  return follow;
}

/**
 * Unfollow an artist
 */
export async function unfollowArtist(
  userId: string,
  artistId: string
): Promise<void> {
  const q = query(
    collection(db, COLLECTIONS.follows),
    where('followerId', '==', userId),
    where('artistId', '==', artistId)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    return; // Already not following
  }

  // Delete all matching follows (should only be one)
  const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
  await Promise.all(deletePromises);
}

/**
 * Check if a user is following an artist
 */
export async function isFollowing(
  userId: string,
  artistId: string
): Promise<FollowDocument | null> {
  const q = query(
    collection(db, COLLECTIONS.follows),
    where('followerId', '==', userId),
    where('artistId', '==', artistId)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data() as FollowDocument;
}

/**
 * Get list of artists a user is following
 */
export async function getFollowing(
  userId: string,
  limitCount: number = 100
): Promise<FollowDocument[]> {
  try {
    const q = query(
      collection(db, COLLECTIONS.follows),
      where('followerId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as FollowDocument);
  } catch (error: any) {
    // Fallback if composite index doesn't exist
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      console.warn('[getFollowing] Composite index missing, using fallback');
      
      const fallbackQuery = query(
        collection(db, COLLECTIONS.follows),
        where('followerId', '==', userId)
      );
      
      const snapshot = await getDocs(fallbackQuery);
      const follows = snapshot.docs.map(doc => doc.data() as FollowDocument);
      
      // Sort in memory by createdAt descending
      return follows.sort((a, b) => 
        b.createdAt.toMillis() - a.createdAt.toMillis()
      ).slice(0, limitCount);
    }
    throw error;
  }
}

/**
 * Get list of users following an artist
 */
export async function getFollowers(
  artistId: string,
  limitCount: number = 100
): Promise<FollowDocument[]> {
  try {
    const q = query(
      collection(db, COLLECTIONS.follows),
      where('artistId', '==', artistId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as FollowDocument);
  } catch (error: any) {
    // Fallback if composite index doesn't exist
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      console.warn('[getFollowers] Composite index missing, using fallback');
      
      const fallbackQuery = query(
        collection(db, COLLECTIONS.follows),
        where('artistId', '==', artistId)
      );
      
      const snapshot = await getDocs(fallbackQuery);
      const follows = snapshot.docs.map(doc => doc.data() as FollowDocument);
      
      // Sort in memory by createdAt descending
      return follows.sort((a, b) => 
        b.createdAt.toMillis() - a.createdAt.toMillis()
      ).slice(0, limitCount);
    }
    throw error;
  }
}

/**
 * Get follower count for an artist
 */
export async function getFollowerCount(artistId: string): Promise<number> {
  const q = query(
    collection(db, COLLECTIONS.follows),
    where('artistId', '==', artistId)
  );

  const snapshot = await getDocs(q);
  return snapshot.size;
}

/**
 * Get all artist IDs that a user is following
 */
export async function getFollowingArtistIds(userId: string): Promise<string[]> {
  const follows = await getFollowing(userId);
  return follows.map(follow => follow.artistId);
}
