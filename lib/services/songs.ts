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
  limit,
  Timestamp,
  serverTimestamp,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
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
import { isListedOnPublicShelf, type CatalogSongRef } from '@/lib/songs/catalogAudio';
import {
  commitIdempotentSongCreate,
  isSongCreateIdempotencyKey,
  SongCreateIdTaken,
} from '@/lib/songs/songCreate';

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
    /** Client id. A retry inside the window returns the same song. */
    idempotencyKey?: string | null;
    /** Kept so a failed shell can be retried from the owner tile. */
    prompt?: string | null;
    lyrics?: string | null;
  }
): Promise<{ song: SongDocument; reused: boolean }> {
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
  const now = Timestamp.now();
  const nowMs = now.toMillis();
  const releasePublic = data.isPublic !== false;
  const idempotencyKey = isSongCreateIdempotencyKey(data.idempotencyKey)
    ? data.idempotencyKey
    : null;
  const createPrompt = typeof data.prompt === 'string' ? data.prompt.trim().slice(0, 300) : '';
  const createLyrics = typeof data.lyrics === 'string' ? data.lyrics.trim().slice(0, 2000) : '';

  const result = await commitIdempotentSongCreate<SongDocument>(
    {
      async get(id) {
        const snap = await getDoc(doc(db, getSongPath(id)));
        if (!snap.exists()) return null;
        return snap.data() as SongDocument;
      },
      async insert(song) {
        const songRef = doc(db, getSongPath(song.id));
        await runTransaction(db, async transaction => {
          const snap = await transaction.get(songRef);
          if (snap.exists()) throw new SongCreateIdTaken();
          transaction.set(songRef, song);
        });
      },
      newId() {
        return doc(collection(db, COLLECTIONS.songs)).id;
      },
    },
    {
      ownerId,
      idempotencyKey,
      nowMs,
      identity: song => ({
        ownerId: song.ownerId,
        deletedAt: song.deletedAt,
        createdAtMs:
          song.createdAt && typeof song.createdAt.toMillis === 'function'
            ? song.createdAt.toMillis()
            : 0,
      }),
      build(songId) {
        const versionId = doc(collection(db, COLLECTIONS.songVersions)).id;
        const song: SongDocument = {
          id: songId,
          ownerId,
          artistId: data.artistId,
          artistVersionId: data.artistVersionId,
          title: data.title,
          // Hidden until the first audio file. A private create stays private.
          isPublic: false,
          audioReady: false,
          ...(releasePublic ? { publicOnReady: true } : {}),
          ...(idempotencyKey ? { idempotencyKey } : {}),
          ...(createPrompt ? { createPrompt } : {}),
          ...(createLyrics ? { createLyrics } : {}),
          createSubmittedAt: now,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          currentVersionId: versionId,
          parentSongId: data.parentSongId || null,
          collaborationType: data.collaborationType || null,
          albumCoverPath: null,
          albumCoverThumbnail: null,
          coverPosterUrl: null,
          coverVideoUrl: null,
          coverMotionStatus: null,
          coverMotionError: null,
          coverUpdatedAt: null,
          coverProvider: null,
          playCount: 0,
        };
        return song;
      },
    }
  );

  if (!result.reused) {
    const version: SongVersionDocument = {
      id: result.song.currentVersionId,
      songId: result.song.id,
      versionNumber: 1,
      title: result.song.title,
      createdBy: ownerId,
      createdAt: result.song.createdAt,
      parentVersionId: null,
      audioURL: null,
      providerOutputId: null,
      isPrimary: true,
    };
    try {
      await setDoc(doc(db, getSongVersionPath(version.id)), version);
    } catch (error) {
      await abandonFailedSongCreate(result.song.id);
      throw error;
    }
  }

  return result;
}

/**
 * Soft-delete a song this client just created when generation never started.
 * Uses the server admin delete. Returns false when the delete did not land,
 * so the caller can reuse the same idempotency key.
 */
export async function abandonFailedSongCreate(
  songId: string,
  input?: { prompt?: string; lyrics?: string }
): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const token = await user.getIdToken();
    const response = await fetch(`/api/songs/${encodeURIComponent(songId)}/abandon`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...(input?.prompt ? { prompt: input.prompt } : {}),
        ...(input?.lyrics ? { lyrics: input.lyrics } : {}),
      }),
    });
    return response.ok || response.status === 404 || response.status === 409;
  } catch (error) {
    console.error('[abandonFailedSongCreate] failed', error);
    return false;
  }
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

  // Get all versions to determine if this should be primary
  const allVersions = await getSongVersions(songId);
  const hasPrimary = allVersions.some(v => v.isPrimary);
  
  // New version should only be primary if no primary exists (first version case)
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
    isPrimary: !hasPrimary, // Only set as primary if no primary exists
  };

  await setDoc(versionRef, newVersion);

  // Only update song.currentVersionId if this is the primary version
  // Otherwise, keep the existing primary version as currentVersionId
  const songRef = doc(db, getSongPath(songId));
  const updateData = {
    title: newVersion.title,
    updatedAt: serverTimestamp(),
    ...(newVersion.isPrimary && { currentVersionId: versionId }),
  };
  
  await setDoc(songRef, updateData, { merge: true });

  return newVersion;
}

/**
 * Get all songs by a user
 */
export async function getUserSongs(
  userId: string,
  limitCount: number = 100
): Promise<SongDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.songs),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snapshot = await getDocs(q);
  // Filter out deleted songs in memory (Firestore doesn't handle null comparisons well)
  // Handle both null and undefined (for older documents without deletedAt field)
  return snapshot.docs
    .map(doc => doc.data() as SongDocument)
    .filter(song => !song.deletedAt);
}

/**
 * Get public songs
 * 
 * @param limitCount - Maximum number of songs to return
 * @param options - Query options
 * @param options.excludeDeleted - If true, exclude deleted songs in Firestore query (default: true)
 *                                 If false, fetch all songs and filter deleted in memory
 */
export async function getPublicSongs(
  limitCount: number = 20,
  options: { excludeDeleted?: boolean } = {}
): Promise<SongDocument[]> {
  const { excludeDeleted = true } = options;
  const fetchCount = publicShelfFetchCount(limitCount);

  if (excludeDeleted) {
    // Query excludes deleted songs at the database level
    // Firestore's == null matches documents where deletedAt is null or doesn't exist
    // This requires a composite index: (isPublic, deletedAt, createdAt)
    // Playable audio is applied after the read so older docs with no audioReady
    // field still match. Shells and expired files do not fill the page.
    try {
      const q = query(
        collection(db, COLLECTIONS.songs),
        where('isPublic', '==', true),
        where('deletedAt', '==', null),
        orderBy('createdAt', 'desc'),
        limit(fetchCount)
      );
      const snapshot = await getDocs(q);
      return takePlayablePublic(
        snapshot.docs.map(doc => doc.data() as SongDocument),
        limitCount
      );
    } catch (error: any) {
      // If composite index doesn't exist, fall back to filtering in memory
      if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
        console.warn('[getPublicSongs] Composite index missing, falling back to memory filtering. Create index: (isPublic, deletedAt, createdAt)');
        // Fall back to query without deletedAt filter
        const q = query(
          collection(db, COLLECTIONS.songs),
          where('isPublic', '==', true),
          orderBy('createdAt', 'desc'),
          limit(fetchCount)
        );
        const snapshot = await getDocs(q);
        return takePlayablePublic(
          snapshot.docs
            .map(doc => doc.data() as SongDocument)
            .filter(song => !song.deletedAt),
          limitCount
        );
      }
      throw error;
    }
  } else {
    // Legacy behavior: fetch all and filter in memory (for backward compatibility)
    const q = query(
      collection(db, COLLECTIONS.songs),
      where('isPublic', '==', true),
      orderBy('createdAt', 'desc'),
      limit(fetchCount)
    );
    const snapshot = await getDocs(q);
    return takePlayablePublic(
      snapshot.docs
        .map(doc => doc.data() as SongDocument)
        .filter(song => !song.deletedAt),
      limitCount
    );
  }
}

/**
 * Get songs by artist
 */
export async function getArtistSongs(
  artistId: string,
  limitCount: number = 20
): Promise<SongDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.songs),
    where('artistId', '==', artistId),
    where('isPublic', '==', true),
    orderBy('createdAt', 'desc'),
    limit(publicShelfFetchCount(limitCount))
  );
  const snapshot = await getDocs(q);
  // Filter out deleted songs in memory (Firestore doesn't handle null comparisons well)
  // Handle both null and undefined (for older documents without deletedAt field)
  return takePlayablePublic(
    snapshot.docs
      .map(doc => doc.data() as SongDocument)
      .filter(song => !song.deletedAt),
    limitCount
  );
}

type ShelfSong = CatalogSongRef & { id: string };

function publicShelfFetchCount(limitCount: number): number {
  return Math.min(Math.max(limitCount * 4, limitCount), Math.max(limitCount, 500));
}

async function takePlayablePublic(
  songs: SongDocument[],
  limitCount: number
): Promise<SongDocument[]> {
  return (await omitExpiredAudioSongs(songs)).slice(0, limitCount);
}

/**
 * Songs a public shelf must skip.
 * `audioReady: false` is skipped without a version read.
 * A failed version read keeps any other song.
 * Expired audio and confirmed silence are skipped. Order is not used here.
 */
export async function unplayablePublicSongIds<T extends ShelfSong>(
  songs: readonly T[]
): Promise<Set<string>> {
  const blocked = new Set<string>();
  await Promise.all(
    songs.map(async song => {
      if (song.deletedAt || song.isPublic !== true || song.audioReady === false) {
        blocked.add(song.id);
        return;
      }
      try {
        const versions = await getSongVersions(song.id);
        if (!isListedOnPublicShelf(song, versions)) blocked.add(song.id);
      } catch (error) {
        console.warn('[unplayablePublicSongIds] version lookup failed', song.id, error);
      }
    })
  );
  return blocked;
}

/**
 * New, Heat, Discover, and search drop shells and expired audio.
 * Order of the input list is kept.
 */
export async function omitExpiredAudioSongs<T extends ShelfSong>(
  songs: readonly T[]
): Promise<T[]> {
  if (songs.length === 0) return [];
  const blocked = await unplayablePublicSongIds(songs);
  return songs.filter(song => !blocked.has(song.id));
}

/**
 * Get top songs ranked by play count
 * 
 * Uses composite index: (isPublic, deletedAt, playCount)
 * This allows direct querying by playCount for accurate top songs.
 * Over-fetches so shells and expired audio do not consume a Heat slot.
 */
export async function getTopSongs(
  limitCount: number = 12
): Promise<SongDocument[]> {
  const fetchCount = Math.min(Math.max(limitCount * 5, limitCount), 100);
  try {
    // Query directly by playCount using the composite index
    const q = query(
      collection(db, COLLECTIONS.songs),
      where('isPublic', '==', true),
      where('deletedAt', '==', null),
      orderBy('playCount', 'desc'),
      limit(fetchCount)
    );
    const snapshot = await getDocs(q);
    
    const ranked = snapshot.docs
      .map(doc => doc.data() as SongDocument)
      .filter(song => !song.deletedAt); // Double-check filter for safety
    return (await omitExpiredAudioSongs(ranked)).slice(0, limitCount);
  } catch (error: any) {
    // Fallback if composite index doesn't exist yet
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      console.warn('[getTopSongs] Composite index missing, using fallback');
      
      // Fallback: fetch more songs and sort in memory
      const fetchLimit = Math.min(limitCount * 10, 500);
      const q = query(
        collection(db, COLLECTIONS.songs),
        where('isPublic', '==', true),
        orderBy('createdAt', 'desc'),
        limit(fetchLimit)
      );
      const snapshot = await getDocs(q);
      
      const ranked = snapshot.docs
        .map(doc => doc.data() as SongDocument)
        .filter(song => !song.deletedAt)
        .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
      return (await omitExpiredAudioSongs(ranked)).slice(0, limitCount);
    }
    throw error;
  }
}

/**
 * Set the primary version for a song.
 *
 * This updates:
 * - The `isPrimary` flag on all versions for the song
 * - The `currentVersionId` field on the song document
 *
 * Writes are performed in a single batch for basic atomicity.
 *
 * @throws Error if song not found, version not found, or version doesn't belong to song
 */
export async function setPrimarySongVersion(
  songId: string,
  versionId: string
): Promise<void> {
  // Validate song exists
  const song = await getSong(songId);
  if (!song) {
    throw new Error(`Song ${songId} not found`);
  }
  if (song.deletedAt) {
    throw new Error('Cannot set primary version for deleted song');
  }

  // Get all versions for the song
  const versionsQuery = query(
    collection(db, COLLECTIONS.songVersions),
    where('songId', '==', songId)
  );
  const versionsSnapshot = await getDocs(versionsQuery);

  if (versionsSnapshot.empty) {
    throw new Error(`No versions found for song ${songId}`);
  }

  // Validate that the target version exists and belongs to this song
  const targetVersion = versionsSnapshot.docs.find(doc => doc.id === versionId);
  if (!targetVersion) {
    throw new Error(`Version ${versionId} not found or does not belong to song ${songId}`);
  }

  // Check if version already has audio (optional validation - versions without audio can still be primary)
  const versionData = targetVersion.data() as SongVersionDocument;
  
  // Create batch update
  const batch = writeBatch(db);

  // Update all versions: set isPrimary based on whether it's the target
  versionsSnapshot.docs.forEach(docSnapshot => {
    const isTarget = docSnapshot.id === versionId;
    batch.update(docSnapshot.ref, { isPrimary: isTarget });
  });

  // Update song to point to primary version
  const songRef = doc(db, getSongPath(songId));
  batch.update(songRef, {
    currentVersionId: versionId,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

/**
 * Ensure primary version consistency for a song.
 * 
 * Fixes common inconsistencies:
 * - No primary version: Sets currentVersionId version as primary (or first version)
 * - Multiple primary versions: Keeps one matching currentVersionId (or oldest)
 * - currentVersionId mismatch: Updates to match primary version
 * 
 * @param songId - The song ID to check and fix
 * @returns Object with information about what was fixed
 */
export async function ensurePrimaryVersionConsistency(
  songId: string
): Promise<{
  fixed: boolean;
  issues: string[];
  actionTaken: string | null;
}> {
  const song = await getSong(songId);
  if (!song || song.deletedAt) {
    return {
      fixed: false,
      issues: ['Song not found or deleted'],
      actionTaken: null,
    };
  }

  const versions = await getSongVersions(songId);
  if (versions.length === 0) {
    return {
      fixed: false,
      issues: ['No versions found'],
      actionTaken: null,
    };
  }

  const primaryVersions = versions.filter(v => v.isPrimary);
  const issues: string[] = [];
  let actionTaken: string | null = null;

  // Check for issues
  if (primaryVersions.length === 0) {
    issues.push('No primary version found');
  } else if (primaryVersions.length > 1) {
    issues.push(`Multiple primary versions found (${primaryVersions.length})`);
  }

  const currentPrimary = primaryVersions.find(v => v.id === song.currentVersionId);
  if (!currentPrimary && primaryVersions.length > 0) {
    issues.push('currentVersionId does not match primary version');
  }

  // If no issues, return early
  if (issues.length === 0) {
    return {
      fixed: false,
      issues: [],
      actionTaken: null,
    };
  }

  // Fix issues
  const batch = writeBatch(db);
  let targetVersionId: string;

  if (primaryVersions.length === 0) {
    // No primary: use currentVersionId if valid, else first version
    const currentVersion = versions.find(v => v.id === song.currentVersionId);
    targetVersionId = currentVersion?.id || versions[0].id;
    actionTaken = `Set version ${targetVersionId} as primary (no primary existed)`;
  } else if (primaryVersions.length > 1) {
    // Multiple primaries: keep one matching currentVersionId, or oldest
    const matchingCurrent = primaryVersions.find(v => v.id === song.currentVersionId);
    targetVersionId = matchingCurrent?.id || primaryVersions[0].id;
    actionTaken = `Fixed multiple primaries, kept version ${targetVersionId}`;
  } else {
    // One primary but currentVersionId mismatch
    targetVersionId = primaryVersions[0].id;
    actionTaken = `Updated currentVersionId to match primary version`;
  }

  // Update all versions
  versions.forEach(version => {
    const versionRef = doc(db, getSongVersionPath(version.id));
    batch.update(versionRef, { isPrimary: version.id === targetVersionId });
  });

  // Update song currentVersionId if needed
  if (song.currentVersionId !== targetVersionId) {
    const songRef = doc(db, getSongPath(songId));
    batch.update(songRef, {
      currentVersionId: targetVersionId,
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();

  return {
    fixed: true,
    issues,
    actionTaken,
  };
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
  
  // One denied artist must not reject the whole page.
  const settled = await Promise.allSettled(uniqueArtistIds.map(artistId => getArtist(artistId)));

  // Create a map of artistId -> artistName
  const artistMap = new Map<string, string>();
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      artistMap.set(uniqueArtistIds[index], result.value.name);
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


