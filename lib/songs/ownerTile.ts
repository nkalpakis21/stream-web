/**
 * Owner dashboard and artist grid.
 * The public never receives this state: callers pass ownerCatalog false,
 * and public queries already drop shells.
 *
 * A shell that is still waiting on audio is "generating" until
 * GENERATION_TIMEOUT_MS after the latest attempt. After that the tile
 * shows Failed, but a later snapshot with audioReady true becomes playable.
 */

export const GENERATION_TIMEOUT_MS = 15 * 60 * 1000;

export type OwnerSongTileState = 'generating' | 'failed';

export type OwnerSongTileView = OwnerSongTileState | 'playable';

export interface OwnerTileSong {
  deletedAt?: unknown;
  audioReady?: unknown;
  generationStatus?: unknown;
  createdAt?: unknown;
  /** Server time of the latest accepted MusicGPT attempt. Falls back to createdAt. */
  generationAttemptAt?: unknown;
  isPublic?: unknown;
}

export function createdAtMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (value && typeof value === 'object') {
    const record = value as { toMillis?: () => unknown; seconds?: unknown };
    if (typeof record.toMillis === 'function') {
      const ms = record.toMillis();
      if (typeof ms === 'number' && Number.isFinite(ms)) return ms;
    }
    if (typeof record.seconds === 'number' && Number.isFinite(record.seconds)) {
      return record.seconds * 1000;
    }
  }
  return null;
}

/** Clock for the 15-minute tile timeout. A new accepted attempt restarts it. */
export function generationStartedAtMs(song: OwnerTileSong): number | null {
  return createdAtMillis(song.generationAttemptAt) ?? createdAtMillis(song.createdAt);
}

export function generationTimedOut(song: OwnerTileSong, nowMs: number): boolean {
  if (song.audioReady === true || song.deletedAt) return false;
  const started = generationStartedAtMs(song);
  if (started == null || !Number.isFinite(nowMs)) return false;
  return nowMs - started >= GENERATION_TIMEOUT_MS;
}

export function ownerSongTileState(
  song: OwnerTileSong,
  ownerCatalog: boolean,
  nowMs: number = Date.now()
): OwnerSongTileState | null {
  if (!ownerCatalog || song.deletedAt) return null;
  if (song.audioReady === true) return null;
  if (song.audioReady !== false && song.generationStatus !== 'failed') return null;
  if (song.generationStatus === 'failed' || generationTimedOut(song, nowMs)) return 'failed';
  if (song.audioReady === false) return 'generating';
  return null;
}

/**
 * Listen only while this owner shell is still waiting on its first audio.
 * Playable cards and everyone else's tiles do not subscribe.
 * A timed-out shell stays audioReady false, so it keeps the listener and
 * can still flip to playable if the file arrives late.
 */
export function shouldListenForOwnerSong(song: OwnerTileSong, ownerCatalog: boolean): boolean {
  return ownerCatalog && !song.deletedAt && song.audioReady === false;
}

export interface OwnerSongSnapshot {
  audioReady?: unknown;
  isPublic?: unknown;
  generationStatus?: unknown;
  generationAttemptAt?: unknown;
  deletedAt?: unknown;
  title?: unknown;
}

/** Merge a song-doc snapshot into the tile's song. audioReady true wins. */
export function mergeOwnerSongSnapshot<T extends OwnerTileSong>(
  song: T,
  snap: OwnerSongSnapshot | null | undefined
): T {
  if (!snap) return song;
  const next: T = { ...song };
  if (snap.audioReady === true || snap.audioReady === false) next.audioReady = snap.audioReady;
  if (snap.isPublic === true || snap.isPublic === false) next.isPublic = snap.isPublic;
  if (snap.generationStatus === 'failed') next.generationStatus = 'failed';
  else if (snap.generationStatus == null && Object.prototype.hasOwnProperty.call(snap, 'generationStatus')) {
    next.generationStatus = null;
  }
  if ('generationAttemptAt' in snap) next.generationAttemptAt = snap.generationAttemptAt;
  if ('deletedAt' in snap) next.deletedAt = snap.deletedAt;
  if (typeof snap.title === 'string' && snap.title) (next as T & { title?: string }).title = snap.title;
  return next;
}

/** What the owner tile shows after one snapshot. Playable means the normal card. */
export function tileViewAfterSnapshot(
  song: OwnerTileSong,
  snap: OwnerSongSnapshot | null | undefined,
  ownerCatalog: boolean,
  nowMs: number
): { song: OwnerTileSong; view: OwnerSongTileView | null } {
  const next = mergeOwnerSongSnapshot(song, snap);
  if (next.audioReady === true && !next.deletedAt) {
    return { song: next, view: 'playable' };
  }
  return { song: next, view: ownerSongTileState(next, ownerCatalog, nowMs) };
}

/**
 * Subscribe only when enabled. Returns the unsubscribe function.
 * Tests pass a fake subscribe to prove generating tiles listen and others do not.
 */
export function attachOwnerSongListener(
  enabled: boolean,
  subscribe: (onSnap: (snap: OwnerSongSnapshot) => void) => () => void,
  onSnap: (snap: OwnerSongSnapshot) => void
): () => void {
  if (!enabled) return () => {};
  return subscribe(onSnap);
}
