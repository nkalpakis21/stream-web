'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { useSongPlayer } from './SongPlayerProvider';
import { createDebouncedPlayTracker } from '@/lib/utils/playTracking';

interface SongPlayCardClientProps {
  songTitle: string;
  artistName: string;
  albumCoverUrl: string | null;
  audioUrl: string | null;
  songId?: string; // Song ID for play tracking (optional)
}

export function SongPlayCardClient({
  songTitle,
  artistName,
  albumCoverUrl,
  audioUrl,
  songId,
}: SongPlayCardClientProps) {
  const { play, nowPlaying, isPlaying, togglePlayPause } = useSongPlayer();
  
  // Create debounced play tracker (500ms debounce)
  const debouncedTrackPlay = useMemo(
    () => createDebouncedPlayTracker(500),
    []
  );
  
  const isCurrentSong = nowPlaying?.audioUrl === audioUrl;
  const showPlayingState = isCurrentSong && isPlaying;

  const handleCardClick = () => {
    if (!audioUrl) return;
    
    // If this is the current song and it's playing, toggle pause
    if (isCurrentSong && isPlaying) {
      togglePlayPause();
    } 
    // If this is the current song but paused, resume
    else if (isCurrentSong && !isPlaying) {
      togglePlayPause();
    }
    // Otherwise, play this song
    else {
      play({
        songTitle,
        artistName,
        albumCoverUrl,
        audioUrl,
      });
      // Track play with debounce (only if songId is provided)
      if (songId) {
        debouncedTrackPlay(songId);
      }
    }
  };

  if (!audioUrl) {
    return (
      <div className="relative w-full max-w-[280px] sm:max-w-[320px] md:max-w-[400px] aspect-square rounded-xl sm:rounded-2xl overflow-hidden shadow-large bg-muted cursor-not-allowed opacity-50">
        {albumCoverUrl ? (
          <Image
            src={albumCoverUrl}
            alt={songTitle}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 280px, (max-width: 768px) 320px, 400px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <svg
              className="w-20 h-20 text-muted-foreground/40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white/60 text-sm">No audio available</div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleCardClick}
      className="relative w-full max-w-[280px] sm:max-w-[320px] md:max-w-[400px] aspect-square rounded-xl sm:rounded-2xl overflow-hidden shadow-large bg-muted cursor-pointer group hover:scale-[1.02] transition-transform duration-200"
    >
      {albumCoverUrl ? (
        <Image
          src={albumCoverUrl}
          alt={songTitle}
          fill
          className="object-cover group-hover:brightness-75 transition-all duration-200"
          sizes="(max-width: 640px) 280px, (max-width: 768px) 320px, 400px"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
          <svg
            className="w-20 h-20 text-muted-foreground/40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
            />
          </svg>
        </div>
      )}
      
      {/* Play/Pause Button Overlay */}
      <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
        showPlayingState ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}>
        <div className="bg-white/90 rounded-full p-3 sm:p-4 shadow-lg">
          {showPlayingState ? (
            <svg className="w-8 h-8 sm:w-12 sm:h-12 text-black" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-8 h-8 sm:w-12 sm:h-12 text-black ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </div>
      </div>

      {/* Song Title Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 sm:p-6">
        <div className="text-white font-semibold text-base sm:text-lg truncate">{songTitle}</div>
        <div className="text-white/80 text-xs sm:text-sm truncate">{artistName}</div>
      </div>
    </div>
  );
}

