/**
 * Public shelves (New, Heat, Discover, search) only list a song that can play.
 * `audioReady: false` is a shell still waiting on its first file.
 * Older songs omit the flag. Those stay listed when a version has playable
 * audio, and drop when it does not. audioExpired still drops a song (#126).
 * A failed version read (`versions == null`) keeps a song that is not an
 * explicit shell, so a lookup error does not empty the shelf.
 */

import {
  playableAudioUrl,
  songAudioExpired,
  type AudioVersionRef,
} from '@/lib/songs/audioAvailability';

export interface CatalogSongRef {
  id?: string;
  isPublic?: unknown;
  deletedAt?: unknown;
  audioReady?: boolean | null;
}

export function isListedOnPublicShelf(
  song: CatalogSongRef | null | undefined,
  versions: readonly AudioVersionRef[] | null
): boolean {
  if (!song || song.deletedAt) return false;
  if (song.isPublic !== true) return false;
  if (song.audioReady === false) return false;
  if (versions == null) return true;
  if (songAudioExpired(versions)) return false;
  return playableAudioUrl(versions) != null;
}

/** Same order as the input. This is the New / Heat / Discover / search gate. */
export function filterPublicShelf<T extends CatalogSongRef>(
  songs: readonly T[],
  versionsFor: (song: T) => readonly AudioVersionRef[] | null
): T[] {
  return songs.filter(song => isListedOnPublicShelf(song, versionsFor(song)));
}
