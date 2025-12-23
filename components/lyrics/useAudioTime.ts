'use client';

import { useEffect, useState } from 'react';
import { useSongPlayer } from '@/components/songs/SongPlayerProvider';

/**
 * Hook to get current audio playback time
 * 
 * This listens to the audio element's timeupdate events via a custom event
 * dispatched from the SpotifyPlayer component.
 * 
 * For Phase 1, this is a simple implementation. In Phase 3, we'll enhance
 * this to directly access the audio element ref.
 */
export function useAudioTime(audioUrl: string | null): {
  currentTime: number;
  isPlaying: boolean;
} {
  const { nowPlaying, isPlaying } = useSongPlayer();
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    // Only track time if this is the currently playing song
    if (!audioUrl || nowPlaying?.audioUrl !== audioUrl) {
      setCurrentTime(0);
      return;
    }

    // Listen for timeupdate events from the audio player
    const handleTimeUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ currentTime: number }>;
      setCurrentTime(customEvent.detail.currentTime);
    };

    window.addEventListener('audio-timeupdate', handleTimeUpdate as EventListener);

    return () => {
      window.removeEventListener('audio-timeupdate', handleTimeUpdate as EventListener);
    };
  }, [audioUrl, nowPlaying?.audioUrl]);

  return {
    currentTime,
    isPlaying: isPlaying && nowPlaying?.audioUrl === audioUrl,
  };
}

