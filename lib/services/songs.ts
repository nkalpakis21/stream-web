/**
 * Song Service
 * 
 * Handles creation, versioning, and management of songs.
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
  Timestamp,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import {
  COLLECTIONS,
  getSongPath,
  getSongVersionPath,
  getArtistPath,
} from '@/lib/firebase/collections';
import type {
  SongDocument,
  SongVersionDocument,
  CollaborationType,
  AIArtistDocument,
} from '@/types/firestore';
import { getArtist } from './artists';
import { getNotificationsBySong } from './notifications';

/**
 * Create a new song
 * Validates that the artist belongs to the user before creating the song.
 */
export async function createSong(
  ownerId: string,
  data: {
    artistId: string;
    artistVersionId: string;
    title: string;
    isPublic?: boolean;
    parentSongId?: string | null;
    collaborationType?: CollaborationType | null;
  }
): Promise<SongDocument> {
  // Validate that the artist belongs to the user
  const artistRef = doc(db, getArtistPath(data.artistId));
  const artistSnapshot = await getDoc(artistRef);
  
  if (!artistSnapshot.exists()) {
    throw new Error('Artist not found');
  }
  
  const artist = artistSnapshot.data() as AIArtistDocument;
  
  if (artist.ownerId !== ownerId) {
    throw new Error('You can only create songs for your own artists');
  }
  
  if (artist.deletedAt !== null) {
    throw new Error('Cannot create songs for deleted artists');
  }
  const songRef = doc(collection(db, COLLECTIONS.songs));
  const songId = songRef.id;

  const now = Timestamp.now();

  // Create initial version
  const versionRef = doc(collection(db, COLLECTIONS.songVersions));
  const versionId = versionRef.id;

  const version: SongVersionDocument = {
    id: versionId,
    songId,
    versionNumber: 1,
    title: data.title,
    createdBy: ownerId,
    createdAt: now,
    parentVersionId: null,
    audioURL: null,
    providerOutputId: null,
    isPrimary: true,
  };

  // Create song document
  const song: SongDocument = {
    id: songId,
    ownerId,
    artistId: data.artistId,
    artistVersionId: data.artistVersionId,
    title: data.title,
    isPublic: data.isPublic ?? true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    currentVersionId: versionId,
    parentSongId: data.parentSongId || null,
    collaborationType: data.collaborationType || null,
    albumCoverPath: null,
    albumCoverThumbnail: null,
    playCount: 0,
  };

  // Write both documents
  await setDoc(songRef, song);
  await setDoc(versionRef, version);

  return song;
}

/**
 * Get a song by ID
 */
export async function getSong(songId: string): Promise<SongDocument | null> {
  const songRef = doc(db, getSongPath(songId));
  const snapshot = await getDoc(songRef);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data() as SongDocument;
}

/**
 * Get a song version by ID
 */
export async function getSongVersion(
  versionId: string
): Promise<SongVersionDocument | null> {
  const versionRef = doc(db, getSongVersionPath(versionId));
  const snapshot = await getDoc(versionRef);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data() as SongVersionDocument;
}

/**
 * Get all versions of a song
 */
export async function getSongVersions(
  songId: string
): Promise<SongVersionDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.songVersions),
    where('songId', '==', songId),
    orderBy('versionNumber', 'asc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as SongVersionDocument);
}

/**
 * Create a new version of a song
 */
export async function createSongVersion(
  songId: string,
  userId: string,
  updates: {
    title?: string;
  }
): Promise<SongVersionDocument> {
  // Get current song and version
  const song = await getSong(songId);
  if (!song) {
    throw new Error(`Song ${songId} not found`);
  }
  if (song.ownerId !== userId) {
    throw new Error('Only the owner can create new versions');
  }

  const currentVersion = await getSongVersion(song.currentVersionId);
  if (!currentVersion) {
    throw new Error('Current version not found');
  }

  // Create new version
  const versionRef = doc(collection(db, COLLECTIONS.songVersions));
  const versionId = versionRef.id;

  const newVersion: SongVersionDocument = {
    id: versionId,
    songId,
    versionNumber: currentVersion.versionNumber + 1,
    title: updates.title ?? currentVersion.title,
    createdBy: userId,
    createdAt: Timestamp.now(),
    parentVersionId: currentVersion.id,
    audioURL: null,
    providerOutputId: null,
    isPrimary: true,
  };

  await setDoc(versionRef, newVersion);

  // Update song to point to new version
  const songRef = doc(db, getSongPath(songId));
  await setDoc(
    songRef,
    {
      title: newVersion.title,
      currentVersionId: versionId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return newVersion;
}

/**
 * Fork a song (create a new song based on an existing one)
 */
export async function forkSong(
  sourceSongId: string,
  newOwnerId: string,
  newArtistId: string,
  newArtistVersionId: string,
  newTitle?: string
): Promise<SongDocument> {
  const sourceSong = await getSong(sourceSongId);
  if (!sourceSong) {
    throw new Error(`Source song ${sourceSongId} not found`);
  }

  const sourceVersion = await getSongVersion(sourceSong.currentVersionId);
  if (!sourceVersion) {
    throw new Error('Source song version not found');
  }

  return createSong(newOwnerId, {
    artistId: newArtistId,
    artistVersionId: newArtistVersionId,
    title: newTitle || `${sourceVersion.title} (Fork)`,
    isPublic: true,
    parentSongId: sourceSongId,
    collaborationType: 'fork',
  });
}

/**
 * Remix a song (similar to fork but with remix type)
 */
export async function remixSong(
  sourceSongId: string,
  newOwnerId: string,
  newArtistId: string,
  newArtistVersionId: string,
  newTitle?: string
): Promise<SongDocument> {
  const sourceSong = await getSong(sourceSongId);
  if (!sourceSong) {
    throw new Error(`Source song ${sourceSongId} not found`);
  }

  const sourceVersion = await getSongVersion(sourceSong.currentVersionId);
  if (!sourceVersion) {
    throw new Error('Source song version not found');
  }

  return createSong(newOwnerId, {
    artistId: newArtistId,
    artistVersionId: newArtistVersionId,
    title: newTitle || `${sourceVersion.title} (Remix)`,
    isPublic: true,
    parentSongId: sourceSongId,
    collaborationType: 'remix',
  });
}

/**
 * Get all songs by a user
 */
export async function getUserSongs(
  userId: string
): Promise<SongDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.songs),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  // Filter out deleted songs in memory (Firestore doesn't handle null comparisons well)
  return snapshot.docs
    .map(doc => doc.data() as SongDocument)
    .filter(song => song.deletedAt === null);
}

/**
 * Get public songs
 */
export async function getPublicSongs(
  limit: number = 20
): Promise<SongDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.songs),
    where('isPublic', '==', true),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  // Filter out deleted songs in memory (Firestore doesn't handle null comparisons well)
  return snapshot.docs
    .map(doc => doc.data() as SongDocument)
    .filter(song => song.deletedAt === null)
    .slice(0, limit);
}

/**
 * Get songs by artist
 */
export async function getArtistSongs(
  artistId: string,
  limit: number = 20
): Promise<SongDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.songs),
    where('artistId', '==', artistId),
    where('isPublic', '==', true),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  // Filter out deleted songs in memory (Firestore doesn't handle null comparisons well)
  return snapshot.docs
    .map(doc => doc.data() as SongDocument)
    .filter(song => song.deletedAt === null)
    .slice(0, limit);
}

/**
 * Get top songs ranked by play count
 */
export async function getTopSongs(
  limit: number = 12
): Promise<SongDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.songs),
    where('isPublic', '==', true)
  );
  const snapshot = await getDocs(q);
  
  // Filter out deleted songs and sort by play count in memory
  // Since playCount is optional, default to 0 for songs without it
  return snapshot.docs
    .map(doc => doc.data() as SongDocument)
    .filter(song => song.deletedAt === null)
    .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
    .slice(0, limit);
}

/**
 * Set the primary version for a song.
 *
 * This updates:
 * - The `isPrimary` flag on all versions for the song
 * - The `currentVersionId` field on the song document
 *
 * Writes are performed in a single batch for basic atomicity.
 */
export async function setPrimarySongVersion(
  songId: string,
  versionId: string
): Promise<void> {
  const versionsQuery = query(
    collection(db, COLLECTIONS.songVersions),
    where('songId', '==', songId)
  );
  const versionsSnapshot = await getDocs(versionsQuery);

  const batch = writeBatch(db);

  versionsSnapshot.docs.forEach(docSnapshot => {
    const isTarget = docSnapshot.id === versionId;
    batch.update(docSnapshot.ref, { isPrimary: isTarget });
  });

  const songRef = doc(db, getSongPath(songId));
  batch.update(songRef, {
    currentVersionId: versionId,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

/**
 * Helper function to fetch artist names for a list of songs
 * Returns a map of songId -> artistName
 */
export async function getArtistNamesForSongs(
  songs: SongDocument[]
): Promise<Map<string, string>> {
  // Get unique artist IDs
  const uniqueArtistIds = [...new Set(songs.map(song => song.artistId))];
  
  // Fetch all artists in parallel
  const artistPromises = uniqueArtistIds.map(artistId => getArtist(artistId));
  const artists = await Promise.all(artistPromises);
  
  // Create a map of artistId -> artistName
  const artistMap = new Map<string, string>();
  artists.forEach((artist, index) => {
    if (artist) {
      artistMap.set(uniqueArtistIds[index], artist.name);
    }
  });
  
  // Create a map of songId -> artistName
  const songArtistMap = new Map<string, string>();
  songs.forEach(song => {
    const artistName = artistMap.get(song.artistId);
    if (artistName) {
      songArtistMap.set(song.id, artistName);
    }
  });
  
  return songArtistMap;
}

/**
 * Delete a song and all related notifications (soft delete)
 * 
 * Only deletes:
 * - Song document itself
 * - All notifications referencing this song
 * 
 * Does NOT delete:
 * - Song Versions (only accessed through parent, effectively hidden)
 * - Generations (only accessed through parent, effectively hidden)
 * - Collaborations (historical records, handle gracefully in UI)
 * 
 * @param songId - The song ID to delete
 * @param userId - The user ID requesting deletion (must be owner)
 * @returns Promise<void>
 * @throws Error if user is not owner or song not found
 */
export async function deleteSong(
  songId: string,
  userId: string
): Promise<void> {
  // Validate ownership
  const song = await getSong(songId);
  if (!song) {
    throw new Error('Song not found');
  }
  if (song.ownerId !== userId) {
    throw new Error('Only the owner can delete this song');
  }
  if (song.deletedAt !== null) {
    throw new Error('Song is already deleted');
  }

  const now = Timestamp.now();
  
  // Get all notifications for this song
  const notifications = await getNotificationsBySong(songId);
  
  // Use batch for atomicity (max 500 operations per batch)
  const batch = writeBatch(db);
  let operationCount = 0;
  
  // Soft delete notifications
  notifications.forEach(notif => {
    if (operationCount >= 500) {
      throw new Error('Too many operations for single batch');
    }
    const notifRef = doc(db, COLLECTIONS.notifications, notif.id);
    batch.update(notifRef, { deletedAt: now });
    operationCount++;
  });
  
  // Soft delete the song
  const songRef = doc(db, getSongPath(songId));
  batch.update(songRef, {
    deletedAt: now,
    updatedAt: serverTimestamp(),
  });
  operationCount++;
  
  // Commit all deletions atomically
  await batch.commit();
}


