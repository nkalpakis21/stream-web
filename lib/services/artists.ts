/**
 * AI Artist Service
 * 
 * Handles creation, versioning, and management of AI Artists.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import {
  COLLECTIONS,
  getArtistPath,
  getArtistVersionPath,
} from '@/lib/firebase/collections';
import type {
  AIArtistDocument,
  AIArtistVersionDocument,
  StyleDNA,
} from '@/types/firestore';

/**
 * Create a new AI Artist
 */
export async function createArtist(
  ownerId: string,
  data: {
    name: string;
    avatarURL?: string | null;
    styleDNA: StyleDNA;
    lore: string;
    isPublic?: boolean;
  }
): Promise<AIArtistDocument> {
  const artistRef = doc(collection(db, COLLECTIONS.artists));
  const artistId = artistRef.id;

  const now = Timestamp.now();

  // Create initial version
  const versionRef = doc(collection(db, COLLECTIONS.artistVersions));
  const versionId = versionRef.id;

  const version: AIArtistVersionDocument = {
    id: versionId,
    artistId,
    versionNumber: 1,
    name: data.name,
    avatarURL: data.avatarURL || null,
    styleDNA: data.styleDNA,
    lore: data.lore,
    createdBy: ownerId,
    createdAt: now,
    parentVersionId: null,
  };

  // Create artist document
  const artist: AIArtistDocument = {
    id: artistId,
    ownerId,
    name: data.name,
    nameLowercase: data.name.toLowerCase().trim(),
    avatarURL: data.avatarURL || null,
    styleDNA: data.styleDNA,
    lore: data.lore,
    isPublic: data.isPublic ?? true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    currentVersionId: versionId,
  };

  // Write both documents
  await setDoc(artistRef, artist);
  await setDoc(versionRef, version);

  return artist;
}

/**
 * Get an artist by ID
 */
export async function getArtist(
  artistId: string
): Promise<AIArtistDocument | null> {
  const artistRef = doc(db, getArtistPath(artistId));
  const snapshot = await getDoc(artistRef);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data() as AIArtistDocument;
}

/**
 * Get an artist version by ID
 */
export async function getArtistVersion(
  versionId: string
): Promise<AIArtistVersionDocument | null> {
  const versionRef = doc(db, getArtistVersionPath(versionId));
  const snapshot = await getDoc(versionRef);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data() as AIArtistVersionDocument;
}

/**
 * Get all versions of an artist
 */
export async function getArtistVersions(
  artistId: string
): Promise<AIArtistVersionDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.artistVersions),
    where('artistId', '==', artistId),
    orderBy('versionNumber', 'asc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as AIArtistVersionDocument);
}

/**
 * Create a new version of an artist
 */
export async function createArtistVersion(
  artistId: string,
  userId: string,
  updates: {
    name?: string;
    avatarURL?: string | null;
    styleDNA?: StyleDNA;
    lore?: string;
  }
): Promise<AIArtistVersionDocument> {
  // Get current artist and version
  const artist = await getArtist(artistId);
  if (!artist) {
    throw new Error(`Artist ${artistId} not found`);
  }
  if (artist.ownerId !== userId) {
    throw new Error('Only the owner can create new versions');
  }

  const currentVersion = await getArtistVersion(artist.currentVersionId);
  if (!currentVersion) {
    throw new Error('Current version not found');
  }

  // Create new version
  const versionRef = doc(collection(db, COLLECTIONS.artistVersions));
  const versionId = versionRef.id;

  const newVersion: AIArtistVersionDocument = {
    id: versionId,
    artistId,
    versionNumber: currentVersion.versionNumber + 1,
    name: updates.name ?? currentVersion.name,
    avatarURL: updates.avatarURL ?? currentVersion.avatarURL,
    styleDNA: updates.styleDNA ?? currentVersion.styleDNA,
    lore: updates.lore ?? currentVersion.lore,
    createdBy: userId,
    createdAt: Timestamp.now(),
    parentVersionId: currentVersion.id,
  };

  await setDoc(versionRef, newVersion);

  // Update artist to point to new version
  const artistRef = doc(db, getArtistPath(artistId));
  await setDoc(
    artistRef,
    {
      name: newVersion.name,
      nameLowercase: newVersion.name.toLowerCase().trim(),
      avatarURL: newVersion.avatarURL,
      styleDNA: newVersion.styleDNA,
      lore: newVersion.lore,
      currentVersionId: versionId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return newVersion;
}

/**
 * Get all artists owned by a user
 */
export async function getUserArtists(
  userId: string,
  limitCount: number = 100
): Promise<AIArtistDocument[]> {
  try {
    // Try with orderBy first (requires index)
    const q = query(
      collection(db, COLLECTIONS.artists),
      where('ownerId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    // Filter out deleted artists in memory (Firestore doesn't handle null comparisons well)
    // Handle both null and undefined (for older documents without deletedAt field)
    const artists = snapshot.docs
      .map(doc => doc.data() as AIArtistDocument)
      .filter(artist => !artist.deletedAt);
    
    return artists;
  } catch (error: any) {
    // If index error, try without orderBy
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      const q = query(
        collection(db, COLLECTIONS.artists),
        where('ownerId', '==', userId),
        limit(limitCount)
      );
      const snapshot = await getDocs(q);
      const artists = snapshot.docs
        .map(doc => doc.data() as AIArtistDocument)
        .filter(artist => !artist.deletedAt)
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
      
      return artists;
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Get public artists
 */
export async function getPublicArtists(
  limitCount: number = 20
): Promise<AIArtistDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.artists),
    where('isPublic', '==', true),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snapshot = await getDocs(q);
  // Filter out deleted artists in memory (Firestore doesn't handle null comparisons well)
  // Handle both null and undefined (for older documents without deletedAt field)
  return snapshot.docs
    .map(doc => doc.data() as AIArtistDocument)
    .filter(artist => !artist.deletedAt);
}

/**
 * Check if an artist name is available (case-insensitive uniqueness check)
 */
export async function checkArtistNameAvailable(
  name: string,
  excludeArtistId?: string
): Promise<boolean> {
  const normalizedName = name.toLowerCase().trim();
  
  if (normalizedName.length < 2 || normalizedName.length > 50) {
    return false;
  }

  // Validate name format
  const allowedPattern = /^[a-zA-Z0-9\s\-_]+$/;
  if (!allowedPattern.test(name.trim())) {
    return false;
  }

  try {
    const q = query(
      collection(db, COLLECTIONS.artists),
      where('nameLowercase', '==', normalizedName),
      limit(10)
    );

    const snapshot = await getDocs(q);
    
    // Filter out deleted artists and excluded artist
    const conflicts = snapshot.docs
      .map(doc => doc.data() as AIArtistDocument)
      .filter(artist => {
        if (artist.deletedAt) return false;
        if (excludeArtistId && artist.id === excludeArtistId) return false;
        return true;
      });

    return conflicts.length === 0;
  } catch (error: any) {
    // Fallback if index doesn't exist - query without nameLowercase filter
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      console.warn('[checkArtistNameAvailable] Index missing, using fallback');
      // For fallback, we'd need to fetch all artists and filter in memory
      // This is inefficient but works as a fallback
      const q = query(collection(db, COLLECTIONS.artists), limit(1000));
      const snapshot = await getDocs(q);
      const conflicts = snapshot.docs
        .map(doc => doc.data() as AIArtistDocument)
        .filter(artist => {
          if (artist.deletedAt) return false;
          if (excludeArtistId && artist.id === excludeArtistId) return false;
          const artistNameLower = (artist.nameLowercase || artist.name.toLowerCase().trim());
          return artistNameLower === normalizedName;
        });
      return conflicts.length === 0;
    }
    throw error;
  }
}

/**
 * Update artist name with uniqueness validation
 */
export async function updateArtistName(
  artistId: string,
  userId: string,
  newName: string
): Promise<AIArtistDocument> {
  // Validate name format
  const trimmedName = newName.trim();
  
  if (trimmedName.length < 2) {
    throw new Error('Artist name must be at least 2 characters');
  }
  
  if (trimmedName.length > 50) {
    throw new Error('Artist name must be 50 characters or less');
  }

  const allowedPattern = /^[a-zA-Z0-9\s\-_]+$/;
  if (!allowedPattern.test(trimmedName)) {
    throw new Error('Artist name can only contain letters, numbers, spaces, hyphens, and underscores');
  }

  // Get artist and validate ownership
  const artist = await getArtist(artistId);
  if (!artist) {
    throw new Error('Artist not found');
  }

  if (artist.ownerId !== userId) {
    throw new Error('Only the owner can update the artist name');
  }

  // Check if name is available (excluding current artist)
  const isAvailable = await checkArtistNameAvailable(trimmedName, artistId);
  if (!isAvailable) {
    throw new Error('This artist name is already taken');
  }

  // Create new version with updated name
  const updatedVersion = await createArtistVersion(artistId, userId, {
    name: trimmedName,
  });

  // Return updated artist
  const updatedArtist = await getArtist(artistId);
  if (!updatedArtist) {
    throw new Error('Failed to retrieve updated artist');
  }

  return updatedArtist;
}

/**
 * Get multiple artists by their IDs (batch fetch)
 */
export async function getArtistsByIds(
  artistIds: string[]
): Promise<AIArtistDocument[]> {
  if (artistIds.length === 0) {
    return [];
  }

  // Firestore 'in' queries are limited to 10 items, so batch if needed
  const artists: AIArtistDocument[] = [];
  
  for (let i = 0; i < artistIds.length; i += 10) {
    const batch = artistIds.slice(i, i + 10);
    const artistPromises = batch.map(artistId => getArtist(artistId));
    const batchArtists = await Promise.all(artistPromises);
    artists.push(...batchArtists.filter((a): a is AIArtistDocument => a !== null));
  }

  return artists;
}

/**
 * Get artists that a user is following
 */
export async function getFollowedArtists(
  userId: string
): Promise<AIArtistDocument[]> {
  const { getFollowing } = await import('./follows');
  const follows = await getFollowing(userId);
  
  if (follows.length === 0) {
    return [];
  }

  const artistIds = follows.map(follow => follow.artistId);
  return getArtistsByIds(artistIds);
}

/**
 * Search artists by name (prefix matching, case-insensitive)
 * Server-side only - queries Firestore directly
 * 
 * @param searchQuery - Artist name prefix to search for
 * @param excludeOwnerId - Owner ID to exclude from results (e.g., current user's own artists)
 * @param limitCount - Maximum number of results (default: 20, max: 50)
 * @returns Array of AIArtistDocument matching the search query
 */
export async function searchArtistsByName(
  searchQuery: string,
  excludeOwnerId?: string,
  limitCount: number = 20
): Promise<AIArtistDocument[]> {
  const trimmedQuery = searchQuery.trim().toLowerCase();
  
  if (!trimmedQuery || trimmedQuery.length === 0) {
    return [];
  }

  // Validate limit
  const limitValue = Math.min(Math.max(1, limitCount), 50);

  try {
    // Query Firestore with prefix matching on nameLowercase
    // Firestore range queries work well for prefix matching
    const q = query(
      collection(db, COLLECTIONS.artists),
      where('nameLowercase', '>=', trimmedQuery),
      where('nameLowercase', '<=', trimmedQuery + '\uf8ff'),
      where('deletedAt', '==', null),
      orderBy('nameLowercase', 'asc'),
      limit(limitValue * 2) // Get more to account for filtering
    );

    const snapshot = await getDocs(q);
    
    // Filter results
    let artists = snapshot.docs
      .map(doc => doc.data() as AIArtistDocument)
      .filter(artist => {
        // Filter out excluded owner's artists
        if (excludeOwnerId && artist.ownerId === excludeOwnerId) {
          return false;
        }
        // Ensure nameLowercase exists and matches prefix
        const nameLower = artist.nameLowercase || artist.name.toLowerCase().trim();
        return nameLower.startsWith(trimmedQuery);
      })
      .slice(0, limitValue);

    return artists;
  } catch (error: any) {
    // Fallback if composite index doesn't exist
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      console.warn('[searchArtistsByName] Index missing, using fallback');
      
      // Fallback: query without orderBy and filter in memory
      const q = query(
        collection(db, COLLECTIONS.artists),
        where('deletedAt', '==', null),
        limit(limitValue * 10) // Get more for in-memory filtering
      );
      
      const snapshot = await getDocs(q);
      const artists = snapshot.docs
        .map(doc => doc.data() as AIArtistDocument)
        .filter(artist => {
          if (excludeOwnerId && artist.ownerId === excludeOwnerId) {
            return false;
          }
          const nameLower = artist.nameLowercase || artist.name.toLowerCase().trim();
          return nameLower.startsWith(trimmedQuery);
        })
        .sort((a, b) => {
          const aName = a.nameLowercase || a.name.toLowerCase();
          const bName = b.nameLowercase || b.name.toLowerCase();
          return aName.localeCompare(bName);
        })
        .slice(0, limitValue);
      
      return artists;
    }
    throw error;
  }
}

