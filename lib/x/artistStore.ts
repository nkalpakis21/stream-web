import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import {
  emptyXConnection,
  type AIArtistDocument,
  type SongDocument,
  type XConnectionPublic,
  type XPostLogEntry,
} from '@/types/firestore';
import type { Timestamp } from 'firebase/firestore';

/** Admin Timestamp is wire-compatible with the client Timestamp we store on artists. */
export function firestoreNow(): Timestamp {
  return AdminTimestamp.now() as unknown as Timestamp;
}

export async function getArtistAdmin(
  artistId: string
): Promise<AIArtistDocument | null> {
  const snap = await getAdminDb().collection(COLLECTIONS.artists).doc(artistId).get();
  if (!snap.exists) return null;
  return snap.data() as AIArtistDocument;
}

export async function getSongAdmin(songId: string): Promise<SongDocument | null> {
  const snap = await getAdminDb().collection(COLLECTIONS.songs).doc(songId).get();
  if (!snap.exists) return null;
  return snap.data() as SongDocument;
}

export function publicXConnection(
  artist: AIArtistDocument | null
): XConnectionPublic {
  return artist?.x ?? emptyXConnection();
}

export async function updateArtistX(
  artistId: string,
  x: Partial<XConnectionPublic>
): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.artists).doc(artistId);
  const snap = await ref.get();
  const current = (snap.data() as AIArtistDocument | undefined)?.x ?? emptyXConnection();
  const next = {
    ...current,
    ...x,
    recentPostTexts: x.recentPostTexts ?? current.recentPostTexts ?? [],
    posts: x.posts ?? current.posts ?? [],
  };
  await ref.set({ x: next }, { merge: true });
}

export async function prependArtistXPost(
  artistId: string,
  entry: XPostLogEntry,
  postText: string
): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.artists).doc(artistId);
  const snap = await ref.get();
  const current = (snap.data() as AIArtistDocument | undefined)?.x ?? emptyXConnection();
  const posts = [entry, ...(current.posts || [])].slice(0, 50);
  const recentPostTexts = [postText, ...(current.recentPostTexts || [])]
    .map(t => t.trim())
    .filter(Boolean)
    .slice(0, 20);
  await ref.set(
    {
      x: {
        ...current,
        posts,
        recentPostTexts,
        lastError: null,
        lastErrorAt: null,
      },
    },
    { merge: true }
  );
}

export async function pauseArtistX(
  artistId: string,
  lastError: string
): Promise<void> {
  const now = firestoreNow();
  await updateArtistX(artistId, {
    status: 'paused',
    pausedAt: now,
    lastError,
    lastErrorAt: now,
  });
}
