/**
 * Owner-only 7-day artist stats.
 * Pure aggregation. Firestore reads stay in `lib/server/artistOwnerStats.ts`.
 *
 * The write path drops a repeat play inside 30s, but that window is process
 * memory (`PLAY_REPEAT_WINDOW_MS`), so another instance can still store the
 * duplicate. Aggregation applies the same rule per song and viewer.
 */

/** Matches `PLAY_REPEAT_WINDOW_MS` in `lib/server/funnel.ts`. */
export const ARTIST_STATS_PLAY_DEDUPE_MS = 30_000;

export const ARTIST_STATS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type ArtistOwnerStats = {
  plays: number;
  listeners: number;
  shares: number;
  xPosts: number;
  xConnected: boolean;
  latestPublicSongId: string | null;
};

export type ArtistStatEvent = {
  /** Firestore doc id. Repeated ids count once. */
  id?: string;
  event: string;
  atMs: number;
  uid?: string | null;
  visitorId?: string | null;
  /** Not written today. Accepted if a caller stored the anon id under this name. */
  anonId?: string | null;
  songId?: string | null;
  artistId?: string | null;
};

export type ArtistStatXPost = {
  status?: unknown;
  postedAtMs?: unknown;
};

export function artistStatsWindow(nowMs: number): { startMs: number; endMs: number } {
  return { startMs: nowMs - ARTIST_STATS_WINDOW_MS, endMs: nowMs };
}

function cleanId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Signed-in uid wins. Otherwise the anon id (`visitorId`, then `anonId`). */
export function statViewerKey(event: Pick<ArtistStatEvent, 'uid' | 'visitorId' | 'anonId'>): string | null {
  const uid = cleanId(event.uid);
  if (uid) return `uid:${uid}`;
  const anon = cleanId(event.visitorId) ?? cleanId(event.anonId);
  if (anon) return `anon:${anon}`;
  return null;
}

export function isOwnerStatActivity(
  event: Pick<ArtistStatEvent, 'uid' | 'visitorId' | 'anonId'>,
  ownerUid: string,
  ownerAnonId?: string | null
): boolean {
  const uid = cleanId(event.uid);
  if (uid && uid === ownerUid) return true;
  const anon = cleanId(event.visitorId) ?? cleanId(event.anonId);
  const ownerAnon = cleanId(ownerAnonId);
  return Boolean(anon && ownerAnon && anon === ownerAnon);
}

/**
 * A song id in this artist's catalog wins, including when `artistId` was
 * omitted. A song id outside the catalog is someone else's song. With no
 * song id, the event counts only when its artist id matches.
 */
export function eventMatchesArtist(
  event: Pick<ArtistStatEvent, 'songId' | 'artistId'>,
  artistId: string,
  songIds: ReadonlySet<string>
): boolean {
  const songId = cleanId(event.songId);
  if (songId) return songIds.has(songId);
  return cleanId(event.artistId) === artistId;
}

function inWindow(atMs: number, nowMs: number): boolean {
  if (!Number.isFinite(atMs) || !Number.isFinite(nowMs)) return false;
  const { startMs, endMs } = artistStatsWindow(nowMs);
  return atMs >= startMs && atMs <= endMs;
}

/** Plays just before the window can still suppress the first in-window play. */
function inDedupeLookback(atMs: number, nowMs: number): boolean {
  if (!Number.isFinite(atMs) || !Number.isFinite(nowMs)) return false;
  const { startMs } = artistStatsWindow(nowMs);
  return atMs >= startMs - ARTIST_STATS_PLAY_DEDUPE_MS && atMs < startMs;
}

function dedupedEvents(events: readonly ArtistStatEvent[]): ArtistStatEvent[] {
  const seen = new Set<string>();
  const out: ArtistStatEvent[] = [];
  for (const event of events) {
    const id = cleanId(event.id);
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push(event);
  }
  return out;
}

function postedAtMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof (value as { toMillis: unknown }).toMillis === 'function'
  ) {
    const ms = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function countXPosts(posts: readonly ArtistStatXPost[], nowMs: number): number {
  let count = 0;
  for (const post of posts) {
    if (post.status !== 'posted') continue;
    const atMs = postedAtMs(post.postedAtMs);
    if (atMs == null || !inWindow(atMs, nowMs)) continue;
    count += 1;
  }
  return count;
}

export function aggregateArtistOwnerStats(input: {
  artistId: string;
  songIds: ReadonlySet<string>;
  events: readonly ArtistStatEvent[];
  xPosts?: readonly ArtistStatXPost[];
  ownerUid: string;
  ownerAnonId?: string | null;
  nowMs: number;
  xConnected?: boolean;
  latestPublicSongId?: string | null;
}): ArtistOwnerStats {
  const events = dedupedEvents(input.events);
  const listeners = new Set<string>();
  const lastKept = new Map<string, number>();
  let plays = 0;

  const playEvents = events
    .filter(event => event.event === 'play')
    .filter(event => eventMatchesArtist(event, input.artistId, input.songIds))
    .filter(event => !isOwnerStatActivity(event, input.ownerUid, input.ownerAnonId))
    .filter(event => inWindow(event.atMs, input.nowMs) || inDedupeLookback(event.atMs, input.nowMs))
    .sort((a, b) => a.atMs - b.atMs || (a.id ?? '').localeCompare(b.id ?? ''));

  for (const event of playEvents) {
    const songId = cleanId(event.songId) ?? '';
    const viewer = statViewerKey(event);
    const key = `${songId}\n${viewer ?? ''}`;
    const prev = lastKept.get(key);
    const duplicate = prev != null && event.atMs - prev < ARTIST_STATS_PLAY_DEDUPE_MS;
    if (!duplicate) lastKept.set(key, event.atMs);
    if (duplicate || !inWindow(event.atMs, input.nowMs)) continue;
    plays += 1;
    if (viewer) listeners.add(viewer);
  }

  let shares = 0;
  for (const event of events) {
    if (event.event !== 'song_shared') continue;
    if (!inWindow(event.atMs, input.nowMs)) continue;
    if (!eventMatchesArtist(event, input.artistId, input.songIds)) continue;
    if (isOwnerStatActivity(event, input.ownerUid, input.ownerAnonId)) continue;
    shares += 1;
  }

  const latest =
    typeof input.latestPublicSongId === 'string' && input.latestPublicSongId.trim()
      ? input.latestPublicSongId.trim()
      : null;

  return {
    plays,
    listeners: listeners.size,
    shares,
    xPosts: countXPosts(input.xPosts ?? [], input.nowMs),
    xConnected: input.xConnected === true,
    latestPublicSongId: latest,
  };
}

/** Connected or paused. Disconnected and missing are not connected. */
export function isArtistXConnected(status: unknown): boolean {
  return status === 'connected' || status === 'paused';
}

function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 0–9,999 in full with a comma. From 10,000, one decimal and a k or m suffix.
 * An empty stat is 0.
 */
export function formatStatCount(value: number): string {
  const n = Number.isFinite(value) ? Math.floor(Math.max(0, value)) : 0;
  if (n < 10_000) return groupThousands(n);
  if (n < 1_000_000) {
    const tenths = Math.round(n / 100);
    if (tenths >= 10_000) return `${(Math.round(n / 100_000) / 10).toFixed(1)}m`;
    return `${(tenths / 10).toFixed(1)}k`;
  }
  const tenths = Math.round(n / 100_000);
  return `${(tenths / 10).toFixed(1)}m`;
}

export function parseArtistOwnerStats(value: unknown): ArtistOwnerStats | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const count = (item: unknown) =>
    typeof item === 'number' && Number.isFinite(item) && item >= 0 ? Math.floor(item) : null;
  const plays = count(row.plays);
  const listeners = count(row.listeners);
  const shares = count(row.shares);
  const xPosts = count(row.xPosts);
  if (plays == null || listeners == null || shares == null || xPosts == null) return null;
  const songId =
    typeof row.latestPublicSongId === 'string' && row.latestPublicSongId.trim()
      ? row.latestPublicSongId.trim()
      : null;
  return {
    plays,
    listeners,
    shares,
    xPosts,
    xConnected: row.xConnected === true,
    latestPublicSongId: songId,
  };
}
