'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { SpotifyPlayer } from './SpotifyPlayer';

interface NowPlaying {
  songTitle: string;
  artistName: string;
  albumCoverUrl: string | null;
  audioUrl: string;
}

interface SongPlayerContextType {
  nowPlaying: NowPlaying | null;
  isPlaying: boolean;
  play: (song: NowPlaying) => void;
  pause: () => void;
  togglePlayPause: () => void;
  close: () => void;
}

const SongPlayerContext = createContext<SongPlayerContextType | undefined>(undefined);

export function SongPlayerProvider({ children }: { children: ReactNode }) {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const play = (song: NowPlaying) => {
    setNowPlaying(song);
    setIsPlaying(true);
  };

  const pause = () => {
    setIsPlaying(false);
  };

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const close = () => {
    setNowPlaying(null);
    setIsPlaying(false);
  };

  return (
    <SongPlayerContext.Provider
      value={{
        nowPlaying,
        isPlaying,
        play,
        pause,
        togglePlayPause,
        close,
      }}
    >
      {children}
      {nowPlaying && (
        <SpotifyPlayer
          songTitle={nowPlaying.songTitle}
          artistName={nowPlaying.artistName}
          albumCoverUrl={nowPlaying.albumCoverUrl}
          audioUrl={nowPlaying.audioUrl}
          isPlaying={isPlaying}
          onPlayPause={togglePlayPause}
          onClose={close}
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



