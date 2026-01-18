/**
 * User Service
 * 
 * Handles fetching and updating user data, particularly display names.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  limit,
  collection,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getUserPath, getArtistPath } from '@/lib/firebase/collections';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type { UserDocument } from '@/types/firestore';
import { getFollowing } from './follows';
import type { AIArtistDocument } from '@/types/firestore';

/**
 * Get a user document by ID
 */
export async function getUser(userId: string): Promise<UserDocument | null> {
  const userRef = doc(db, getUserPath(userId));
  const userDoc = await getDoc(userRef);

  if (!userDoc.exists()) {
    return null;
  }

  const user = userDoc.data() as UserDocument;
  if (user.deletedAt) {
    return null; // Treat soft-deleted users as not found
  }

  return user;
}

/**
 * Update a user's display name
 * Creates the user document if it doesn't exist
 */
export async function updateUserDisplayName(
  userId: string,
  displayName: string,
  userEmail?: string
): Promise<void> {
  // Validate display name
  const trimmed = displayName.trim();
  
  if (trimmed.length < 2) {
    throw new Error('Display name must be at least 2 characters');
  }
  
  if (trimmed.length > 30) {
    throw new Error('Display name must be 30 characters or less');
  }

  // Validate allowed characters: letters, numbers, spaces, hyphens, underscores
  const allowedPattern = /^[a-zA-Z0-9\s\-_]+$/;
  if (!allowedPattern.test(trimmed)) {
    throw new Error('Display name can only contain letters, numbers, spaces, hyphens, and underscores');
  }

  const userRef = doc(db, getUserPath(userId));
  
  // Check if user document exists
  const userDoc = await getDoc(userRef);
  
  if (userDoc.exists()) {
    // Update existing document
    await updateDoc(userRef, {
      displayName: trimmed,
      updatedAt: serverTimestamp(),
    });
  } else {
    // Create new user document if it doesn't exist
    const now = Timestamp.now();
    await setDoc(userRef, {
      email: userEmail || '',
      displayName: trimmed,
      photoURL: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }
}

/**
 * Get display name for a user with fallback strategy:
 * 1. displayName (if set)
 * 2. Email username (part before @)
 * 3. Truncated user ID (last resort)
 */
export async function getUserDisplayName(userId: string): Promise<string> {
  const user = await getUser(userId);
  
  if (!user) {
    return `User ${userId.substring(0, 8)}...`;
  }

  if (user.displayName) {
    return user.displayName;
  }

  if (user.email) {
    const emailUsername = user.email.split('@')[0];
    return emailUsername;
  }

  return `User ${userId.substring(0, 8)}...`;
}

/**
 * Batch fetch display names for multiple users
 * Returns a Map of userId -> displayName
 */
export async function getUsersDisplayNames(
  userIds: string[]
): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }

  // Remove duplicates
  const uniqueIds = Array.from(new Set(userIds));

  // Fetch users individually (Firestore doesn't support querying by document ID easily)
  // We could use a batch get, but for simplicity, we'll fetch individually
  // In production, consider using Firestore batch get for better performance
  const displayNames = new Map<string, string>();
  
  const fetchPromises = uniqueIds.map(async (userId) => {
    try {
      const name = await getUserDisplayName(userId);
      return { userId, name };
    } catch (err) {
      return { userId, name: `User ${userId.substring(0, 8)}...` };
    }
  });

  const results = await Promise.all(fetchPromises);
  results.forEach(({ userId, name }) => {
    displayNames.set(userId, name);
  });

  // Fill in any missing users with fallback
  for (const userId of uniqueIds) {
    if (!displayNames.has(userId)) {
      displayNames.set(userId, `User ${userId.substring(0, 8)}...`);
    }
  }

  return displayNames;
}

/**
 * Search users by display name (prefix matching)
 * Server-side only - queries Firestore directly
 * 
 * @param searchQuery - Display name prefix to search for
 * @param excludeUserId - User ID to exclude from results (e.g., current user)
 * @param limitCount - Maximum number of results (default: 10, max: 50)
 * @returns Array of UserDocument matching the search query
 */
export async function searchUsersByDisplayName(
  searchQuery: string,
  excludeUserId?: string,
  limitCount: number = 10
): Promise<UserDocument[]> {
  const trimmedQuery = searchQuery.trim();
  
  if (!trimmedQuery || trimmedQuery.length === 0) {
    return [];
  }

  // Validate limit
  const limitValue = Math.min(Math.max(1, limitCount), 50);

  try {
    // Query Firestore with prefix matching
    // Note: This is case-sensitive. Firestore doesn't support case-insensitive queries natively
    const q = query(
      collection(db, COLLECTIONS.users),
      where('displayName', '>=', trimmedQuery),
      where('displayName', '<=', trimmedQuery + '\uf8ff'),
      where('deletedAt', '==', null),
      limit(limitValue * 2) // Get more to account for filtering
    );

    const snapshot = await getDocs(q);
    
    // Filter results
    let users = snapshot.docs
      .map(doc => doc.data() as UserDocument)
      .filter(user => {
        // Filter out excluded user
        if (excludeUserId && user.id === excludeUserId) {
          return false;
        }
        // Ensure displayName exists and matches prefix (case-sensitive)
        return user.displayName && user.displayName.startsWith(trimmedQuery);
      })
      .slice(0, limitValue);

    return users;
  } catch (error: any) {
    // Fallback if composite index doesn't exist
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      console.warn('[searchUsersByDisplayName] Composite index missing, using fallback');
      
      // Fallback: query without deletedAt filter
      const fallbackQuery = query(
        collection(db, COLLECTIONS.users),
        where('displayName', '>=', trimmedQuery),
        where('displayName', '<=', trimmedQuery + '\uf8ff'),
        limit(limitValue * 2)
      );
      
      const snapshot = await getDocs(fallbackQuery);
      let users = snapshot.docs
        .map(doc => doc.data() as UserDocument)
        .filter(user => {
          // Filter deleted users
          if (user.deletedAt) {
            return false;
          }
          // Filter out excluded user
          if (excludeUserId && user.id === excludeUserId) {
            return false;
          }
          // Ensure displayName exists and matches prefix
          return user.displayName && user.displayName.startsWith(trimmedQuery);
        })
        .slice(0, limitValue);

      return users;
    }
    throw error;
  }
}

/**
 * Get users from artists that a user is following
 * Server-side only - queries Firestore directly
 * 
 * @param userId - User ID to get followed artists for
 * @returns Array of UserDocument for users who own followed artists
 */
export async function getUsersFromFollowedArtists(
  userId: string
): Promise<UserDocument[]> {
  try {
    // Get list of artists user is following
    const follows = await getFollowing(userId);
    
    if (follows.length === 0) {
      return [];
    }

    // Extract unique artist IDs
    const artistIds = Array.from(new Set(follows.map(follow => follow.artistId)));

    // Batch fetch artist documents to get ownerIds
    // Firestore has a limit of 10 items per 'in' query, so we batch if needed
    const ownerIds = new Set<string>();
    
    for (let i = 0; i < artistIds.length; i += 10) {
      const batch = artistIds.slice(i, i + 10);
      const artistPromises = batch.map(artistId => {
        const artistRef = doc(db, getArtistPath(artistId));
        return getDoc(artistRef);
      });
      
      const artistSnapshots = await Promise.all(artistPromises);
      
      artistSnapshots.forEach(snapshot => {
        if (snapshot.exists()) {
          const artist = snapshot.data() as AIArtistDocument;
          // Exclude current user
          if (artist.ownerId !== userId && !artist.deletedAt) {
            ownerIds.add(artist.ownerId);
          }
        }
      });
    }

    if (ownerIds.size === 0) {
      return [];
    }

    // Batch fetch user documents
    // Firestore has a limit of 10 items per 'in' query
    const uniqueOwnerIds = Array.from(ownerIds);
    const users: UserDocument[] = [];

    for (let i = 0; i < uniqueOwnerIds.length; i += 10) {
      const batch = uniqueOwnerIds.slice(i, i + 10);
      const userPromises = batch.map(ownerId => {
        const userRef = doc(db, getUserPath(ownerId));
        return getDoc(userRef);
      });
      
      const userSnapshots = await Promise.all(userPromises);
      
      userSnapshots.forEach(snapshot => {
        if (snapshot.exists()) {
          const user = snapshot.data() as UserDocument;
          // Filter out deleted users
          if (!user.deletedAt) {
            users.push(user);
          }
        }
      });
    }

    return users;
  } catch (error) {
    console.error('[getUsersFromFollowedArtists] Error:', error);
    throw error;
  }
}
