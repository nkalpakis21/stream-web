'use client';

import { useCallback, useRef, useState } from 'react';
import {
  artistDefaults,
  customizeResetKey,
  initialSongCustomize,
  type ArtistStyleInput,
  type SongCustomizeValue,
} from '@/lib/create/songOptions';

/** Resets to the artist's defaults when the artist, usual moods, or energy change. */
export function useSongCustomize(artist?: ArtistStyleInput | null) {
  const defaults = artistDefaults(artist);
  const resetKey = customizeResetKey(artist);
  const [value, setValue] = useState<SongCustomizeValue>(() => initialSongCustomize(defaults));
  const [seenKey, setSeenKey] = useState(resetKey);
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setValue(initialSongCustomize(defaults));
  }

  const reset = useCallback(() => {
    setValue(initialSongCustomize(defaultsRef.current));
  }, []);

  return { defaults, value, setValue, reset, resetKey };
}
