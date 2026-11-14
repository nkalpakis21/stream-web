import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { grandfatherStamp, resolveAutoPost, timestampMillis } from '@/lib/x/autoPost';
import {
  emptyXConnection,
  type AIArtistDocument,
  type SongDocument,
  type XConnectionPublic,
  type XPendingDeferred,
  type XPostLogEntry,
  type XPostReservation,
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

function mergeX(
  current: XConnectionPublic,
  patch: Partial<XConnectionPublic>
): XConnectionPublic {
  return {
    ...current,
    ...patch,
    recentPostTexts: patch.recentPostTexts ?? current.recentPostTexts ?? [],
    posts: patch.posts ?? current.posts ?? [],
  };
}

export async function updateArtistX(
  artistId: string,
  x: Partial<XConnectionPublic>
): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.artists).doc(artistId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const current = (snap.data() as AIArtistDocument | undefined)?.x ?? emptyXConnection();
    tx.set(ref, { x: mergeX(current, x) }, { merge: true });
  });
}

/**
 * Disconnect shape. Clears opt-in and deferral fields that `emptyXConnection`
 * does not list, so a later connect starts off. Not used by client creates.
 */
export function clearedXConnection(): XConnectionPublic {
  return {
    ...emptyXConnection(),
    autoPost: false,
    autoPostEnabledAt: null,
    lastPostedAt: null,
    nextPostAtMs: null,
    pendingDeferred: null,
    lastSkippedTitle: null,
    lastSkippedAtMs: null,
    reservations: [],
  };
}

/**
 * First evaluation of a grandfathered connection. Writes only missing fields.
 * Returns the enabledAt that later songs must be ready at or after.
 */
export async function persistGrandfatherAutoPost(
  artistId: string,
  nowMs: number
): Promise<{ autoPost: boolean; enabledAtMs: number | null }> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.artists).doc(artistId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const x = (snap.data() as AIArtistDocument | undefined)?.x ?? emptyXConnection();
    const source = {
      status: x.status,
      autoPost: x.autoPost,
      autoPostEnabledAtMs: timestampMillis(x.autoPostEnabledAt),
    };
    const stamp = grandfatherStamp(source, nowMs);
    if (!stamp) {
      return {
        autoPost: resolveAutoPost(source),
        enabledAtMs: source.autoPostEnabledAtMs ?? null,
      };
    }
    const patch: Record<string, unknown> = {
      'x.autoPostEnabledAt': AdminTimestamp.fromMillis(stamp.autoPostEnabledAtMs),
    };
    if (stamp.autoPost === true) patch['x.autoPost'] = true;
    tx.update(ref, patch);
    return { autoPost: true, enabledAtMs: stamp.autoPostEnabledAtMs };
  });
}

export function reservationsWithout(
  list: XPostReservation[] | null | undefined,
  songId: string
): XPostReservation[] {
  return (list || []).filter(entry => entry && entry.songId !== songId);
}

export function reservationsWith(
  list: XPostReservation[] | null | undefined,
  songId: string,
  atMs: number
): XPostReservation[] {
  return [...reservationsWithout(list, songId), { songId, atMs }].slice(-10);
}

/** Point the owner row at the soonest deferred claim for this artist. */
export async function refreshArtistDeferred(artistId: string): Promise<void> {
  const db = getAdminDb();
  const snap = await db
    .collection(COLLECTIONS.xSongPosts)
    .where('artistId', '==', artistId)
    .limit(100)
    .get();
  let best: XPendingDeferred | null = null;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.status !== 'deferred') continue;
    const notBeforeMs = data.notBeforeMs;
    if (typeof notBeforeMs !== 'number' || !Number.isFinite(notBeforeMs)) continue;
    const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'Song';
    if (!best || notBeforeMs < best.notBeforeMs) {
      best = { songId: doc.id, title, notBeforeMs };
    }
  }
  await updateArtistX(artistId, {
    pendingDeferred: best,
    nextPostAtMs: best ? best.notBeforeMs : null,
  });
}

export async function prependArtistXPost(
  artistId: string,
  entry: XPostLogEntry,
  postText: string
): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.artists).doc(artistId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const current = (snap.data() as AIArtistDocument | undefined)?.x ?? emptyXConnection();
    const posts = [entry, ...(current.posts || [])].slice(0, 50);
    const recentPostTexts = [postText, ...(current.recentPostTexts || [])]
      .map(t => t.trim())
      .filter(Boolean)
      .slice(0, 20);
    const postedAt = timestampMillis(entry.createdAt) ?? Date.now();
    const pending =
      current.pendingDeferred?.songId === entry.songId ? null : current.pendingDeferred ?? null;
    tx.set(
      ref,
      {
        x: {
          ...current,
          posts,
          recentPostTexts,
          lastError: null,
          lastErrorAt: null,
          lastPostedAt: postedAt,
          lastSkippedTitle: null,
          lastSkippedAtMs: null,
          reservations: reservationsWithout(current.reservations, entry.songId),
          pendingDeferred: pending,
          nextPostAtMs: pending?.notBeforeMs ?? null,
        },
      },
      { merge: true }
    );
  });
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
