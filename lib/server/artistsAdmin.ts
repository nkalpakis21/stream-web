import {
  FieldValue,
  Timestamp,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { MAX_ARTIST_BIO_LENGTH } from '@/lib/brand/bio';
import type { AIArtistDocument, AIArtistVersionDocument } from '@/types/firestore';
import { isMissingIndexError } from '@/lib/server/indexError';

export async function adminGetArtist(artistId: string): Promise<AIArtistDocument | null> {
  return adminGetArtistFrom(getAdminDb(), artistId);
}

export async function adminGetArtistsByIds(artistIds: readonly string[]): Promise<AIArtistDocument[]> {
  const unique = [...new Set(artistIds.map(id => id.trim()).filter(Boolean))];
  const artists: AIArtistDocument[] = [];
  const db = getAdminDb();
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const refs = chunk.map(id => db.collection(COLLECTIONS.artists).doc(id));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data() as AIArtistDocument;
      artists.push({ ...data, id: data.id || snap.id });
    }
  }
  return artists;
}

async function adminGetArtistFrom(
  db: Firestore,
  artistId: string
): Promise<AIArtistDocument | null> {
  const snap = await db.collection(COLLECTIONS.artists).doc(artistId).get();
  if (!snap.exists) return null;
  const data = snap.data() as AIArtistDocument;
  return { ...data, id: data.id || snap.id };
}

async function adminGetArtistVersion(
  db: Firestore,
  versionId: string
): Promise<AIArtistVersionDocument | null> {
  const snap = await db.collection(COLLECTIONS.artistVersions).doc(versionId).get();
  if (!snap.exists) return null;
  return snap.data() as AIArtistVersionDocument;
}

async function adminCheckArtistNameAvailable(
  db: Firestore,
  name: string,
  excludeArtistId?: string
): Promise<boolean> {
  const normalizedName = name.toLowerCase().trim();
  if (normalizedName.length < 2 || normalizedName.length > 50) return false;
  if (!/^[a-zA-Z0-9\s\-_]+$/.test(name.trim())) return false;

  const collection = db.collection(COLLECTIONS.artists);
  const conflictsOf = (docs: QueryDocumentSnapshot[]) =>
    docs
      .map((doc) => doc.data() as AIArtistDocument)
      .filter((artist) => {
        if (artist.deletedAt) return false;
        if (excludeArtistId && artist.id === excludeArtistId) return false;
        return true;
      });

  try {
    const snap = await collection.where('nameLowercase', '==', normalizedName).limit(10).get();
    return conflictsOf(snap.docs).length === 0;
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    console.warn('[adminCheckArtistNameAvailable] Index missing, using fallback');
    const snap = await collection.limit(1000).get();
    const conflicts = snap.docs
      .map((doc) => doc.data() as AIArtistDocument)
      .filter((artist) => {
        if (artist.deletedAt) return false;
        if (excludeArtistId && artist.id === excludeArtistId) return false;
        const artistNameLower = artist.nameLowercase || artist.name.toLowerCase().trim();
        return artistNameLower === normalizedName;
      });
    return conflicts.length === 0;
  }
}

async function adminCreateArtistVersion(
  db: Firestore,
  artistId: string,
  userId: string,
  updates: { name?: string; lore?: string }
): Promise<void> {
  const artist = await adminGetArtistFrom(db, artistId);
  if (!artist) throw new Error(`Artist ${artistId} not found`);
  if (artist.ownerId !== userId) {
    throw new Error('Only the owner can create new versions');
  }

  const currentVersion = await adminGetArtistVersion(db, artist.currentVersionId);
  if (!currentVersion) throw new Error('Current version not found');

  const versionRef = db.collection(COLLECTIONS.artistVersions).doc();
  const newVersion: AIArtistVersionDocument = {
    id: versionRef.id,
    artistId,
    versionNumber: currentVersion.versionNumber + 1,
    name: updates.name ?? artist.name,
    avatarURL: currentVersion.avatarURL,
    styleDNA: currentVersion.styleDNA,
    lore: updates.lore ?? currentVersion.lore,
    vocalIdentity: currentVersion.vocalIdentity ?? null,
    createdBy: userId,
    createdAt: Timestamp.now() as unknown as AIArtistVersionDocument['createdAt'],
    parentVersionId: currentVersion.id,
  };

  await versionRef.set(newVersion);
  await db.collection(COLLECTIONS.artists).doc(artistId).set(
    {
      name: newVersion.name,
      nameLowercase: newVersion.name.toLowerCase().trim(),
      avatarURL: newVersion.avatarURL,
      styleDNA: newVersion.styleDNA,
      lore: newVersion.lore,
      vocalIdentity: newVersion.vocalIdentity ?? null,
      currentVersionId: versionRef.id,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function adminUpdateArtistName(
  artistId: string,
  userId: string,
  newName: string,
  db: Firestore = getAdminDb()
): Promise<AIArtistDocument> {
  const trimmedName = newName.trim();
  if (trimmedName.length < 2) {
    throw new Error('Artist name must be at least 2 characters');
  }
  if (trimmedName.length > 50) {
    throw new Error('Artist name must be 50 characters or less');
  }
  if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmedName)) {
    throw new Error(
      'Artist name can only contain letters, numbers, spaces, hyphens, and underscores'
    );
  }

  const artist = await adminGetArtistFrom(db, artistId);
  if (!artist) throw new Error('Artist not found');
  if (artist.ownerId !== userId) {
    throw new Error('Only the owner can update the artist name');
  }

  const isAvailable = await adminCheckArtistNameAvailable(db, trimmedName, artistId);
  if (!isAvailable) throw new Error('This artist name is already taken');

  await adminCreateArtistVersion(db, artistId, userId, { name: trimmedName });
  const updated = await adminGetArtistFrom(db, artistId);
  if (!updated) throw new Error('Failed to retrieve updated artist');
  return updated;
}

export async function adminUpdateArtistLore(
  artistId: string,
  userId: string,
  lore: string,
  db: Firestore = getAdminDb()
): Promise<AIArtistDocument> {
  const trimmed = lore.trim();
  if (trimmed.length > MAX_ARTIST_BIO_LENGTH) {
    throw new Error(`Bio must be ${MAX_ARTIST_BIO_LENGTH} characters or less`);
  }

  const artist = await adminGetArtistFrom(db, artistId);
  if (!artist) throw new Error('Artist not found');
  if (artist.ownerId !== userId) {
    throw new Error('Only the owner can update the artist bio');
  }
  if (artist.lore === trimmed) return artist;

  await adminCreateArtistVersion(db, artistId, userId, { lore: trimmed });
  const updated = await adminGetArtistFrom(db, artistId);
  if (!updated) throw new Error('Failed to retrieve updated artist');
  return updated;
}
