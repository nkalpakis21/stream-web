'use client';

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
}: LyricsControlsProps) {
  return (
    <div className="mt-6 flex items-center justify-center gap-4 border-t border-border pt-6">
      {mode === 'minimal' && (
        <button
          type="button"
          onClick={() => onModeChange('immersive')}
          className="min-h-11 px-4 text-sm font-medium text-foreground hover:text-accent"
          aria-label="View lyrics in immersive mode"
        >
          Full screen
        </button>
      )}
      {mode === 'immersive' && (
        <button
          type="button"
          onClick={() => onModeChange('minimal')}
          className="min-h-11 px-4 text-sm font-medium text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          Close
        </button>
      )}
    </div>
  );
}
