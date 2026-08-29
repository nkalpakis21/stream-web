'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { SpotifyPlayer } from './SpotifyPlayer';
import { ListenPlayer } from '@/components/player/ListenPlayer';
import { isStudioPath } from '@/lib/listen/surface';
import { getSongVersions } from '@/lib/services/songs';

export interface PlayerTrack {
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
  if (item.audioUrl) return item.audioUrl;
  if (!item.songId) return null;
  const versions = await getSongVersions(item.songId);
  return (
    versions.find(v => v.isPrimary && v.audioURL)?.audioURL ||
    versions.find(v => v.audioURL)?.audioURL ||
    null
  );
}

export function SongPlayerProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const studio = isStudioPath(pathname);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState<PlayerTrack[]>([]);
  const [index, setIndex] = useState(0);

  const play = useCallback((song: NowPlaying, nextQueue?: PlayerTrack[]) => {
    const list = nextQueue && nextQueue.length > 0 ? nextQueue : [song];
    const found = list.findIndex(item => sameTrack(item, song));
    setQueue(list);
    setIndex(found >= 0 ? found : 0);
    setNowPlaying(song);
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const togglePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const close = useCallback(() => {
    setNowPlaying(null);
    setIsPlaying(false);
    setQueue([]);
    setIndex(0);
  }, []);

  const jumpTo = useCallback(
    async (start: number, direction: 1 | -1) => {
      if (queue.length === 0) return;
      let cursor = start;
      while (cursor >= 0 && cursor < queue.length) {
        const item = queue[cursor];
        const url = await resolveAudio(item);
        if (url) {
          setIndex(cursor);
          setNowPlaying({ ...item, audioUrl: url });
          setIsPlaying(true);
          return;
        }
        cursor += direction;
      }
      setIsPlaying(false);
    },
    [queue]
  );

  const playPrev = useCallback(() => {
    void jumpTo(index - 1, -1);
  }, [jumpTo, index]);

  const playNext = useCallback(() => {
    void jumpTo(index + 1, 1);
  }, [jumpTo, index]);

  const skipEnded = useCallback(() => {
    if (index + 1 < queue.length) {
      void jumpTo(index + 1, 1);
      return;
    }
    setIsPlaying(false);
  }, [jumpTo, index, queue.length]);

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
        />
      )}
    </SongPlayerContext.Provider>
  );
}

export function useSongPlayer() {
  const context = useContext(SongPlayerContext);
  if (context === undefined) {
    throw new Error('useSongPlayer must be used within a SongPlayerProvider');
  }
  return context;
}
