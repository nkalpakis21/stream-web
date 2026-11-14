/**
 * Playable audio for a song.
 * Playback tries the primary version that has a URL, then any version with a URL.
 * audioExpired is set by scripts/backfill-song-audio.ts in --apply mode when
 * MusicGPT no longer serves that file. A version without the flag still plays.
 */

export interface AudioVersionRef {
  id?: string;
  audioURL?: string | null;
  audioExpired?: boolean | null;
  isPrimary?: boolean;
}

function urlOf(version: AudioVersionRef): string {
  return typeof version.audioURL === 'string' ? version.audioURL.trim() : '';
}

function isPlayable(version: AudioVersionRef): boolean {
  return urlOf(version).length > 0 && version.audioExpired !== true;
}

/** Version a player would open first, including one whose file has expired. */
export function playbackAudioVersion<T extends AudioVersionRef>(
  versions: readonly T[]
): T | null {
  return (
    versions.find(version => version.isPrimary && urlOf(version).length > 0) ??
    versions.find(version => urlOf(version).length > 0) ??
    null
  );
}

/**
 * True when the version playback would try is audioExpired and no other
 * version still has playable audio.
 */
export function songAudioExpired(versions: readonly AudioVersionRef[]): boolean {
  const chosen = playbackAudioVersion(versions);
  if (!chosen || chosen.audioExpired !== true) return false;
  return !versions.some(version => version !== chosen && isPlayable(version));
}

/** URL to play. Skips expired files. Null when nothing playable remains. */
export function playableAudioUrl(versions: readonly AudioVersionRef[]): string | null {
  const primary = versions.find(version => version.isPrimary && isPlayable(version));
  if (primary) return urlOf(primary);
  const other = versions.find(version => isPlayable(version));
  return other ? urlOf(other) : null;
}

/**
 * URL the player may start. When versions loaded, an expired song yields null
 * even if the caller still holds the dead MusicGPT URL.
 * Empty version lists fall through to a direct URL (in-progress or unread).
 */
export function audioUrlForPlayback(
  versions: readonly AudioVersionRef[] | null | undefined,
  directUrl?: string | null
): string | null {
  if (versions && versions.length > 0) {
    if (songAudioExpired(versions)) return null;
    const playable = playableAudioUrl(versions);
    if (playable) return playable;
  }
  const direct = typeof directUrl === 'string' ? directUrl.trim() : '';
  return direct || null;
}

/** Drops songs whose audio is expired. Unknown version lists stay. Order is kept. */
export function withoutExpiredAudio<T>(
  songs: readonly T[],
  versionsFor: (song: T) => readonly AudioVersionRef[] | null | undefined
): T[] {
  const kept: T[] = [];
  for (const song of songs) {
    const versions = versionsFor(song);
    if (versions && songAudioExpired(versions)) continue;
    kept.push(song);
  }
  return kept;
}

/**
 * One catalog window after expired songs are removed.
 * The cursor is the last document examined so a later page does not skip
 * or repeat, and expired rows do not take a slot.
 */
export function takePlayablePage<T extends { id: string }>(
  ordered: readonly T[],
  isExpired: (song: T) => boolean,
  limitCount: number,
  fetchedFullWindow: boolean
): { songs: T[]; nextCursor: string | null; hasMore: boolean } {
  if (limitCount <= 0 || ordered.length === 0) {
    return { songs: [], nextCursor: null, hasMore: false };
  }
  const songs: T[] = [];
  let consumed = -1;
  for (let i = 0; i < ordered.length; i += 1) {
    consumed = i;
    if (!isExpired(ordered[i])) songs.push(ordered[i]);
    if (songs.length === limitCount) break;
  }
  const consumedAll = consumed === ordered.length - 1;
  const hasMore = !consumedAll || fetchedFullWindow;
  return {
    songs,
    nextCursor: hasMore ? ordered[consumed].id : null,
    hasMore,
  };
}
