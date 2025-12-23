'use client';

import { useState } from 'react';
import type { DisplayMode } from './LyricsSection';
import type { LyricsData } from '@/lib/utils/lyrics';

interface LyricsControlsProps {
  mode: DisplayMode;
  onModeChange: (mode: DisplayMode) => void;
  lyrics: LyricsData;
  songTitle: string;
  artistName: string;
  albumCoverUrl?: string | null;
}

export function LyricsControls({
  mode,
  onModeChange,
  lyrics,
  songTitle,
  artistName,
  albumCoverUrl,
}: LyricsControlsProps) {
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = async () => {
    // TODO: Implement share functionality
    // For now, copy lyrics to clipboard
    try {
      await navigator.clipboard.writeText(lyrics.raw);
      setIsSharing(true);
      setTimeout(() => setIsSharing(false), 2000);
    } catch (error) {
      console.error('Failed to copy lyrics:', error);
    }
  };

  return (
    <div className="flex items-center justify-center gap-4 mt-6 pt-6 border-t border-border">
      {mode === 'minimal' && (
        <button
          onClick={() => onModeChange('immersive')}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground hover:text-accent transition-colors"
          aria-label="View lyrics in immersive mode"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
            />
          </svg>
          <span>Full Screen</span>
        </button>
      )}

      {mode === 'immersive' && (
        <button
          onClick={() => onModeChange('minimal')}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Return to minimal view"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          <span>Close</span>
        </button>
      )}

      <button
        onClick={handleShare}
        disabled={isSharing}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground hover:text-accent transition-colors disabled:opacity-50"
        aria-label="Share lyrics"
      >
        {isSharing ? (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>Copied!</span>
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
            <span>Share</span>
          </>
        )}
      </button>
    </div>
  );
}

