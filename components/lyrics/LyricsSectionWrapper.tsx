'use client';

import { LyricsSection } from './LyricsSection';
import { useAudioTime } from './useAudioTime';
import type { LyricsData } from '@/lib/utils/lyrics';

interface LyricsSectionWrapperProps {
  lyrics: LyricsData;
  songTitle: string;
  artistName: string;
  albumCoverUrl?: string | null;
  audioUrl?: string | null;
}

/**
 * Wrapper component that connects lyrics to audio playback
 * This separates server-side lyrics data from client-side audio sync
 */
export function LyricsSectionWrapper({
  lyrics,
  songTitle,
  artistName,
  albumCoverUrl,
  audioUrl,
}: LyricsSectionWrapperProps) {
  const { currentTime, isPlaying } = useAudioTime(audioUrl || null);

  return (
    <LyricsSection
      lyrics={lyrics}
      songTitle={songTitle}
      artistName={artistName}
      albumCoverUrl={albumCoverUrl}
      audioUrl={audioUrl}
      currentTime={currentTime}
      isPlaying={isPlaying}
    />
  );
}

