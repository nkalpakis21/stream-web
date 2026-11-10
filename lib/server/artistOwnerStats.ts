/**
 * Admin reads for GET /api/artists/[id]/stats.
 * Clients cannot read funnelEvents. Queries stay inside the artist's songs
 * and a 7-day range (plus the 30s play lookback).
 */

import { Timestamp, type Query, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import {
  ARTIST_STATS_PLAY_DEDUPE_MS,
  aggregateArtistOwnerStats,
  artistStatsWindow,
  isArtistXConnected,
  type ArtistOwnerStats,
  type ArtistStatEvent,
  type ArtistStatXPost,
} from '@/lib/artists/ownerStats';
import { artistIsVisible } from '@/lib/artists/visibility';
import { HttpError } from '@/lib/server/auth';
import { timestampMillis } from '@/lib/server/funnel';
import { adminGetArtist } from '@/lib/server/artistsAdmin';
import { songIsSharePublic } from '@/lib/songs/shareCard';

const SONG_IN_LIMIT = 30;
const PAGE_SIZE = 500;
const MAX_PAGES = 20;

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readEvent(doc: QueryDocumentSnapshot): ArtistStatEvent {
  const data = doc.data() as Record<string, unknown>;
  const props =
    data.props && typeof data.props === 'object'
      ? (data.props as Record<string, unknown>)
      : {};
  return {
    id: doc.id,
    event: typeof data.event === 'string' ? data.event : '',
    atMs: timestampMillis(data.at) ?? Number.NaN,
    uid: stringOrNull(data.uid),
    visitorId: stringOrNull(data.visitorId),
    anonId: stringOrNull(data.anonId),
    songId: stringOrNull(props.songId) ?? stringOrNull(data.songId),
    artistId: stringOrNull(props.artistId) ?? stringOrNull(data.artistId),
  };
}

async function collectPages(query: Query): Promise<QueryDocumentSnapshot[]> {
  const docs: QueryDocumentSnapshot[] = [];
  let page: Query = query.limit(PAGE_SIZE);
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const snap = await page.get();
    docs.push(...snap.docs);
    if (snap.size < PAGE_SIZE) return docs;
    const last = snap.docs[snap.docs.length - 1];
    if (!last) return docs;
    page = query.limit(PAGE_SIZE).startAfter(last);
  }
  console.warn('[artist-stats] stopped at the event page cap');
  return docs;
}

async function listArtistSongs(artistId: string): Promise<{
  songIds: Set<string>;
  latestPublicSongId: string | null;
}> {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.songs)
    .where('artistId', '==', artistId)
    .select('id', 'isPublic', 'deletedAt', 'audioReady', 'generationStatus', 'createdAt')
    .get();
  const songIds = new Set<string>();
  let latest: { id: string; at: number } | null = null;
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    songIds.add(doc.id);
    const storedId = stringOrNull(data.id);
    if (storedId) songIds.add(storedId);
    const gate = {
      isPublic: data.isPublic,
      deletedAt: data.deletedAt,
      audioReady: data.audioReady,
      generationStatus: data.generationStatus,
    };
    if (!songIsSharePublic(gate)) continue;
    const createdAtMs = timestampMillis(data.createdAt) ?? 0;
    if (!latest || createdAtMs > latest.at || (createdAtMs === latest.at && doc.id > latest.id)) {
      latest = { id: doc.id, at: createdAtMs };
    }
  }
  return { songIds, latestPublicSongId: latest?.id ?? null };
}

async function listFunnelEvents(
  artistId: string,
  songIds: ReadonlySet<string>,
  fromMs: number
): Promise<ArtistStatEvent[]> {
  const db = getAdminDb();
  const events = new Map<string, ArtistStatEvent>();
  const remember = (docs: QueryDocumentSnapshot[]) => {
    for (const doc of docs) {
      if (!events.has(doc.id)) events.set(doc.id, readEvent(doc));
    }
  };
  const from = Timestamp.fromMillis(fromMs);
  const ids = [...songIds];
  for (let i = 0; i < ids.length; i += SONG_IN_LIMIT) {
    const chunk = ids.slice(i, i + SONG_IN_LIMIT);
    if (chunk.length === 0) continue;
    const query = db
      .collection(COLLECTIONS.funnelEvents)
      .where('props.songId', 'in', chunk)
      .where('at', '>=', from)
      .orderBy('at', 'asc');
    remember(await collectPages(query));
  }
  const byArtist = db
    .collection(COLLECTIONS.funnelEvents)
    .where('props.artistId', '==', artistId)
    .where('at', '>=', from)
    .orderBy('at', 'asc');
  remember(await collectPages(byArtist));
  return [...events.values()];
}

async function listXPosts(artistId: string, startMs: number, endMs: number): Promise<ArtistStatXPost[]> {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.xSongPosts)
    .where('artistId', '==', artistId)
    .where('status', '==', 'posted')
    .where('postedAtMs', '>=', startMs)
    .where('postedAtMs', '<=', endMs)
    .orderBy('postedAtMs', 'asc')
    .get();
  return snap.docs.map(doc => {
    const data = doc.data() as Record<string, unknown>;
    return { status: data.status, postedAtMs: data.postedAtMs };
  });
}

/**
 * Caller uid must be the artist owner. `ownerAnonId` is the ss_visitor cookie
 * on this request, when it is a real visitor id.
 */
export async function loadArtistOwnerStats(input: {
  artistId: string;
  uid: string;
  ownerAnonId?: string | null;
  nowMs?: number;
}): Promise<ArtistOwnerStats> {
  const artistId = input.artistId.trim();
  if (!artistId || artistId.length > 128 || artistId.includes('/')) {
    throw new HttpError(404, 'Artist not found');
  }
  const artist = await adminGetArtist(artistId);
  if (!artistIsVisible(artist, input.uid)) {
    throw new HttpError(404, 'Artist not found');
  }
  if (artist.ownerId !== input.uid) {
    throw new HttpError(403, 'Only the owner can view artist stats');
  }

  const nowMs = input.nowMs ?? Date.now();
  const { startMs } = artistStatsWindow(nowMs);
  const [songs, xPosts] = await Promise.all([
    listArtistSongs(artistId),
    listXPosts(artistId, startMs, nowMs),
  ]);
  const events = await listFunnelEvents(
    artistId,
    songs.songIds,
    startMs - ARTIST_STATS_PLAY_DEDUPE_MS
  );

  return aggregateArtistOwnerStats({
    artistId,
    songIds: songs.songIds,
    events,
    xPosts,
    ownerUid: artist.ownerId,
    ownerAnonId: input.ownerAnonId,
    nowMs,
    xConnected: isArtistXConnected(artist.x?.status),
    latestPublicSongId: songs.latestPublicSongId,
  });
}
