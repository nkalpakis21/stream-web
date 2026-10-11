import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type { GenerationDocument, SongDocument, SongVersionDocument } from '@/types/firestore';
import { isMissingIndexError } from '@/lib/server/indexError';
import { selectArtistPageSongs } from '@/lib/artists/ownerSongs';
import {
  countedPlayFieldUpdates,
  type PlayAttribution,
} from '@/lib/server/playAttribution';

const OWNER_ARTIST_SONG_LIMIT = 100;

/**
 * Every non-deleted song on this artist that belongs to ownerId, including private.
 * Call only after the verified viewer is that owner. Admin reads bypass rules, so
 * the query itself is constrained to ownerId and the result is filtered again.
 */
export async function adminListOwnerArtistSongs(
  artistId: string,
  ownerId: string,
  limitCount: number = OWNER_ARTIST_SONG_LIMIT
): Promise<SongDocument[]> {
  const songs = getAdminDb().collection(COLLECTIONS.songs);
  let docs: SongDocument[];
  try {
    const snap = await songs
      .where('artistId', '==', artistId)
      .where('ownerId', '==', ownerId)
      .orderBy('createdAt', 'desc')
      .limit(limitCount)
      .get();
    docs = snap.docs.map(doc => doc.data() as SongDocument);
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    try {
      const snap = await songs.where('artistId', '==', artistId).where('ownerId', '==', ownerId).get();
      docs = snap.docs.map(doc => doc.data() as SongDocument);
    } catch (fallbackError) {
      if (!isMissingIndexError(fallbackError)) throw fallbackError;
      const snap = await songs
        .where('ownerId', '==', ownerId)
        .orderBy('createdAt', 'desc')
        .limit(limitCount)
        .get();
      docs = snap.docs
        .map(doc => doc.data() as SongDocument)
        .filter(song => song.artistId === artistId);
    }
  }
  return selectArtistPageSongs(docs, ownerId, ownerId, artistId).slice(0, limitCount);
}

export async function adminGetSong(songId: string): Promise<SongDocument | null> {
  const snap = await getAdminDb().collection(COLLECTIONS.songs).doc(songId).get();
  if (!snap.exists) return null;
  return snap.data() as SongDocument;
}

export async function adminGetSongVersions(songId: string): Promise<SongVersionDocument[]> {
  const collection = getAdminDb().collection(COLLECTIONS.songVersions);
  try {
    const snap = await collection
      .where('songId', '==', songId)
      .orderBy('versionNumber', 'asc')
      .get();
    return snap.docs.map((doc) => doc.data() as SongVersionDocument);
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    const snap = await collection.where('songId', '==', songId).get();
    return snap.docs
      .map((doc) => doc.data() as SongVersionDocument)
      .sort((a, b) => a.versionNumber - b.versionNumber);
  }
}

function timeMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const ms = (value as { toMillis: () => number }).toMillis();
    if (typeof ms === 'number' && Number.isFinite(ms)) return ms;
  }
  return 0;
}

/** Generations for a song the caller is already allowed to render. */
export async function adminGetSongGenerations(songId: string): Promise<GenerationDocument[]> {
  const collection = getAdminDb().collection(COLLECTIONS.generations);
  try {
    const snap = await collection.where('songId', '==', songId).orderBy('createdAt', 'desc').get();
    return snap.docs.map(doc => doc.data() as GenerationDocument);
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    const snap = await collection.where('songId', '==', songId).get();
    return snap.docs
      .map(doc => doc.data() as GenerationDocument)
      .sort((a, b) => timeMillis(b.createdAt) - timeMillis(a.createdAt));
  }
}

export async function adminIncrementPlayCount(
  songId: string,
  attribution: PlayAttribution = { source: null, background: null }
): Promise<void> {
  const increment = FieldValue.increment(1);
  const updates = countedPlayFieldUpdates(attribution, 'counted', increment);
  await getAdminDb()
    .collection(COLLECTIONS.songs)
    .doc(songId)
    .update(updates ?? { playCount: increment });
}

export async function adminUpdateSongOwnerFields(
  songId: string,
  fields: { title?: string; isPublic?: boolean; incrementPlayCount?: boolean }
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (fields.title !== undefined) updates.title = fields.title;
  if (fields.isPublic !== undefined) updates.isPublic = fields.isPublic;
  if (fields.incrementPlayCount) updates.playCount = FieldValue.increment(1);
  if (Object.keys(updates).length === 0) return;
  await getAdminDb().collection(COLLECTIONS.songs).doc(songId).update(updates);
}

/**
 * Soft-delete a song and notifications that point at it.
 * Caller must already have checked ownership.
 */
export async function adminSoftDeleteSong(songId: string): Promise<void> {
  const db = getAdminDb();
  const songRef = db.collection(COLLECTIONS.songs).doc(songId);
  const songSnap = await songRef.get();
  if (!songSnap.exists) {
    throw new Error('Song not found');
  }
  const song = songSnap.data() as SongDocument;
  if (song.deletedAt !== null) {
    throw new Error('Song is already deleted');
  }

  const notifications = await db
    .collection(COLLECTIONS.notifications)
    .where('songId', '==', songId)
    .get();

  const now = Timestamp.now();
  const batch = db.batch();
  let operationCount = 0;
  notifications.docs.forEach((notif) => {
    const data = notif.data() as { deletedAt?: unknown };
    if (data.deletedAt) return;
    if (operationCount >= 499) {
      throw new Error('Too many operations for single batch');
    }
    batch.update(notif.ref, { deletedAt: now });
    operationCount++;
  });

  batch.update(songRef, {
    deletedAt: now,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
}

export async function adminSetPrimarySongVersion(
  songId: string,
  versionId: string
): Promise<void> {
  const db = getAdminDb();
  const songRef = db.collection(COLLECTIONS.songs).doc(songId);
  const songSnap = await songRef.get();
  if (!songSnap.exists) {
    throw new Error(`Song ${songId} not found`);
  }
  const song = songSnap.data() as SongDocument;
  if (song.deletedAt) {
    throw new Error('Cannot set primary version for deleted song');
  }

  const versionsSnap = await db
    .collection(COLLECTIONS.songVersions)
    .where('songId', '==', songId)
    .get();
  if (versionsSnap.empty) {
    throw new Error(`No versions found for song ${songId}`);
  }
  const target = versionsSnap.docs.find((doc) => doc.id === versionId);
  if (!target) {
    throw new Error(`Version ${versionId} not found or does not belong to song ${songId}`);
  }

  const batch = db.batch();
  versionsSnap.docs.forEach((doc) => {
    batch.update(doc.ref, { isPrimary: doc.id === versionId });
  });
  batch.update(songRef, {
    currentVersionId: versionId,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
}
