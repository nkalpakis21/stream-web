'use client';

import { useEffect, useRef, useState } from 'react';
import type { LyricsData, TimestampedLine } from '@/lib/utils/lyrics';
import { splitLyricsIntoLines, findActiveLineIndex } from '@/lib/utils/lyrics';
import type { DisplayMode } from './LyricsSection';
import { LyricsLine } from './LyricsLine';

interface LyricsViewerProps {
  lyrics: LyricsData;
  mode: DisplayMode;
  currentTime?: number;
  isPlaying?: boolean;
  audioUrl?: string | null;
}

export function LyricsViewer({
  lyrics,
  mode,
  currentTime = 0,
  isPlaying = false,
  audioUrl,
}: LyricsViewerProps) {
  const lines = splitLyricsIntoLines(lyrics.raw);
  const [activeLineIndex, setActiveLineIndex] = useState<number>(-1);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync active line with audio playback
  useEffect(() => {
    if (!isPlaying || !lyrics.timestamped || lyrics.timestamped.length === 0) {
      setActiveLineIndex(-1);
      return;
    }

    const index = findActiveLineIndex(lyrics.timestamped, currentTime);
    setActiveLineIndex(index);
  }, [currentTime, isPlaying, lyrics.timestamped]);

  // Auto-scroll to active line (immersive mode only)
  useEffect(() => {
    if (
      mode !== 'immersive' ||
      activeLineIndex === -1 ||
      !activeLineRef.current ||
      !containerRef.current
    ) {
      return;
    }

    const container = containerRef.current;
    const activeLine = activeLineRef.current;
    const containerRect = container.getBoundingClientRect();
    const lineRect = activeLine.getBoundingClientRect();

    // Check if line is outside viewport
    const isAboveViewport = lineRect.top < containerRect.top;
    const isBelowViewport = lineRect.bottom > containerRect.bottom;

    if (isAboveViewport || isBelowViewport) {
      activeLine.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeLineIndex, mode]);

  const baseClasses = {
    minimal: 'text-lg sm:text-xl leading-[1.8] text-left font-playfair',
    immersive: 'text-2xl lg:text-3xl xl:text-4xl leading-[1.9] text-center max-w-[680px] mx-auto font-playfair',
    shareable: 'text-xl leading-[1.7] text-center max-w-[600px] mx-auto font-playfair',
  };

  const containerClasses = {
    minimal: 'space-y-3 sm:space-y-4',
    immersive: 'space-y-6 py-12',
    shareable: 'space-y-4 py-8',
  };

  return (
    <div
      ref={containerRef}
      className={`${baseClasses[mode]} ${containerClasses[mode]}`}
    >
      {lines.map((line, index) => {
        // Find corresponding timestamped data if available
        const timestampedLine = lyrics.timestamped?.find(
          (tl, i) => i === index || tl.text.includes(line)
        );

        const isActive = Boolean(
          isPlaying &&
          activeLineIndex === index &&
          lyrics.timestamped &&
          lyrics.timestamped.length > 0
        );

        return (
          <LyricsLine
            key={`${index}-${line.substring(0, 10)}`}
            ref={isActive ? activeLineRef : null}
            text={line}
            isActive={isActive}
            mode={mode}
            timestamp={timestampedLine?.start}
            audioUrl={audioUrl}
            index={index}
          />
        );
      })}
    </div>
  );
}

