'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { SpotifyPlayer } from './SpotifyPlayer';
import { ListenPlayer } from '@/components/player/ListenPlayer';
import { isStudioPath } from '@/lib/listen/surface';
import { getSongVersions } from '@/lib/services/songs';
import { audioUrlForPlayback } from '@/lib/songs/audioAvailability';
import { advanceToPlayable } from '@/lib/player/skipQueue';
import type { CoverFields } from '@/lib/covers/resolve';

export interface PlayerTrack extends CoverFields {
  songId?: string;
  songTitle: string;
  artistName: string;
  artistId?: string;
  albumCoverUrl: string | null;
  audioUrl?: string;
}

export interface NowPlaying extends PlayerTrack {
  audioUrl: string;
}

interface SongPlayerContextType {
  nowPlaying: NowPlaying | null;
  isPlaying: boolean;
  canPrev: boolean;
  canNext: boolean;
  play: (song: NowPlaying, queue?: PlayerTrack[]) => void;
  pause: () => void;
  togglePlayPause: () => void;
  close: () => void;
  playPrev: () => void;
  playNext: () => void;
  skipEnded: () => void;
}

const SongPlayerContext = createContext<SongPlayerContextType | undefined>(undefined);

function sameTrack(a: PlayerTrack, b: PlayerTrack) {
  if (a.songId && b.songId) return a.songId === b.songId;
  return Boolean(a.audioUrl && b.audioUrl && a.audioUrl === b.audioUrl);
}

async function resolveAudio(item: PlayerTrack): Promise<string | null> {
  if (item.songId) {
    try {
      const versions = await getSongVersions(item.songId);
      if (versions.length > 0) return audioUrlForPlayback(versions, item.audioUrl);
    } catch {
      // A direct URL is only used when versions cannot be read.
    }
  }
  return audioUrlForPlayback(null, item.audioUrl);
}

export function SongPlayerProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const studio = isStudioPath(pathname);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState<PlayerTrack[]>([]);
  const [index, setIndex] = useState(0);
  const queueRef = useRef<PlayerTrack[]>([]);
  const indexRef = useRef(0);
  const playRequest = useRef(0);

  const land = useCallback(async (start: number, direction: 1 | -1, ifNone: 'pause' | 'clear') => {
    const list = queueRef.current;
    const request = ++playRequest.current;
    const landed = await advanceToPlayable(list, start, direction, resolveAudio);
    if (playRequest.current !== request) return;
    if (!landed) {
      setIsPlaying(false);
      if (ifNone === 'clear') setNowPlaying(null);
      return;
    }
    indexRef.current = landed.index;
    setIndex(landed.index);
    setNowPlaying({ ...list[landed.index], audioUrl: landed.audioUrl });
    setIsPlaying(true);
  }, []);

  const play = useCallback((song: NowPlaying, nextQueue?: PlayerTrack[]) => {
    const list = nextQueue && nextQueue.length > 0 ? nextQueue : [song];
    const found = list.findIndex(item => sameTrack(item, song));
    const start = found >= 0 ? found : 0;
    const seeded = list.map((item, itemIndex) =>
      itemIndex === start ? { ...item, audioUrl: song.audioUrl || item.audioUrl } : item
    );
    queueRef.current = seeded;
    indexRef.current = start;
    setQueue(seeded);
    setIndex(start);
    void land(start, 1, 'clear');
  }, [land]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const togglePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const close = useCallback(() => {
    playRequest.current += 1;
    queueRef.current = [];
    indexRef.current = 0;
    setNowPlaying(null);
    setIsPlaying(false);
    setQueue([]);
    setIndex(0);
  }, []);

  const playPrev = useCallback(() => {
    void land(indexRef.current - 1, -1, 'pause');
  }, [land]);

  const playNext = useCallback(() => {
    void land(indexRef.current + 1, 1, 'pause');
  }, [land]);

  const skipEnded = useCallback(() => {
    if (indexRef.current + 1 < queueRef.current.length) {
      void land(indexRef.current + 1, 1, 'pause');
      return;
    }
    setIsPlaying(false);
  }, [land]);

  const skipFailed = useCallback(() => {
    void land(indexRef.current + 1, 1, 'clear');
  }, [land]);

  const value = useMemo<SongPlayerContextType>(
    () => ({
      nowPlaying,
      isPlaying,
      canPrev: index > 0,
      canNext: index + 1 < queue.length,
      play,
      pause,
      togglePlayPause,
      close,
      playPrev,
      playNext,
      skipEnded,
    }),
    [nowPlaying, isPlaying, index, queue.length, play, pause, togglePlayPause, close, playPrev, playNext, skipEnded]
  );

  return (
    <SongPlayerContext.Provider value={value}>
      {children}
      {studio ? (
        nowPlaying ? (
          <SpotifyPlayer
            songTitle={nowPlaying.songTitle}
            artistName={nowPlaying.artistName}
            albumCoverUrl={nowPlaying.albumCoverUrl}
            audioUrl={nowPlaying.audioUrl}
            isPlaying={isPlaying}
            onPlayPause={togglePlayPause}
            onClose={close}
            onPlaybackError={skipFailed}
          />
        ) : null
      ) : (
        <ListenPlayer
          nowPlaying={nowPlaying}
          isPlaying={isPlaying}
          canPrev={index > 0}
          canNext={index + 1 < queue.length}
          onToggle={togglePlayPause}
          onPrev={playPrev}
          onNext={playNext}
          onEnded={skipEnded}
          onPlaybackError={skipFailed}
        />
      )}
    </SongPlayerContext.Provider>
  );
}

/** Test and static render. No router, no player chrome. */
export function SongPlayerStaticProvider({ children }: { children: ReactNode }) {
  const value = useMemo<SongPlayerContextType>(
    () => ({
      nowPlaying: null,
      isPlaying: false,
      canPrev: false,
      canNext: false,
      play: () => {},
      pause: () => {},
      togglePlayPause: () => {},
      close: () => {},
      playPrev: () => {},
      playNext: () => {},
      skipEnded: () => {},
    }),
    []
  );
  return <SongPlayerContext.Provider value={value}>{children}</SongPlayerContext.Provider>;
}

export function useSongPlayer() {
  const context = useContext(SongPlayerContext);
  if (context === undefined) {
    throw new Error('useSongPlayer must be used within a SongPlayerProvider');
  }
  return context;
}
