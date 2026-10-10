import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type { SongDocument, SongVersionDocument } from '@/types/firestore';
import { isMissingIndexError } from '@/lib/server/indexError';
import {
  countedPlayFieldUpdates,
  type PlayAttribution,
} from '@/lib/server/playAttribution';

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
