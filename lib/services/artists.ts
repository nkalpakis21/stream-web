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

