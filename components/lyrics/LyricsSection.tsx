'use client';

import { useState, useEffect } from 'react';
import type { LyricsData } from '@/lib/utils/lyrics';
import { LyricsViewer } from './LyricsViewer';
import { LyricsControls } from './LyricsControls';

export type DisplayMode = 'minimal' | 'immersive' | 'shareable';

interface LyricsSectionProps {
  lyrics: LyricsData | null;
  songTitle: string;
  artistName: string;
  albumCoverUrl?: string | null;
  audioUrl?: string | null;
  currentTime?: number;
  isPlaying?: boolean;
}

export function LyricsSection({
  lyrics,
  songTitle,
  artistName,
  albumCoverUrl,
  audioUrl,
  currentTime = 0,
  isPlaying = false,
}: LyricsSectionProps) {
  const [mode, setMode] = useState<DisplayMode>('minimal');
  const [isExpanded, setIsExpanded] = useState(true); // Start expanded by default
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    setIsVisible(true);
  }, []);

  if (!lyrics || !lyrics.raw) {
    return null;
  }

  return (
    <section className="w-full">
      {mode === 'minimal' && (
        <div
          className={`relative bg-gradient-to-br from-card via-card to-card/95 rounded-2xl border border-border/50 overflow-hidden shadow-2xl backdrop-blur-sm transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{
            boxShadow: '0 20px 60px -15px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          }}
        >
          {/* Decorative gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-accent/10 pointer-events-none" />
          
          {/* Header */}
          <div className="relative">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full px-8 py-6 flex items-center justify-between text-left hover:bg-muted/30 transition-all duration-300 group"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Collapse lyrics' : 'Expand lyrics'}
            >
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-accent/20 rounded-lg blur-xl group-hover:bg-accent/30 transition-all duration-300" />
                  <div className="relative p-2 bg-gradient-to-br from-accent/10 to-accent/5 rounded-lg">
                    <svg
                      className="w-6 h-6 text-accent"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground tracking-tight">Lyrics</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">Tap to {isExpanded ? 'collapse' : 'expand'}</p>
                </div>
              </div>
              <div className="relative">
                <div className="absolute inset-0 bg-accent/10 rounded-full blur-lg group-hover:bg-accent/20 transition-all duration-300" />
                <svg
                  className={`relative w-6 h-6 text-accent transition-all duration-300 ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </button>
          </div>

          {isExpanded && (
            <div className="relative px-8 pb-8 pt-4 border-t border-border/50">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
              <LyricsViewer
                lyrics={lyrics}
                mode={mode}
                currentTime={currentTime}
                isPlaying={isPlaying}
                audioUrl={audioUrl}
              />
              <LyricsControls
                mode={mode}
                onModeChange={setMode}
                lyrics={lyrics}
                songTitle={songTitle}
                artistName={artistName}
                albumCoverUrl={albumCoverUrl}
              />
            </div>
          )}
        </div>
      )}

      {mode === 'immersive' && (
        <div className="fixed inset-0 z-50 bg-gradient-to-br from-background via-background to-muted/20 backdrop-blur-md animate-in fade-in duration-500">
          <div className="h-full overflow-y-auto">
            <div className="max-w-4xl mx-auto px-6 py-16">
              <button
                onClick={() => setMode('minimal')}
                className="mb-12 flex items-center gap-3 text-muted-foreground hover:text-foreground transition-all duration-300 group"
                aria-label="Close immersive view"
              >
                <div className="p-2 rounded-lg bg-muted/50 group-hover:bg-muted transition-colors">
                  <svg
                    className="w-5 h-5"
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
                </div>
                <span className="font-medium">Close</span>
              </button>
              {albumCoverUrl && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-5">
                  <div 
                    className="absolute inset-0 bg-cover bg-center blur-3xl scale-150"
                    style={{ backgroundImage: `url(${albumCoverUrl})` }}
                  />
                </div>
              )}
              <div className="relative">
                <LyricsViewer
                  lyrics={lyrics}
                  mode={mode}
                  currentTime={currentTime}
                  isPlaying={isPlaying}
                  audioUrl={audioUrl}
                />
                <LyricsControls
                  mode={mode}
                  onModeChange={setMode}
                  lyrics={lyrics}
                  songTitle={songTitle}
                  artistName={artistName}
                  albumCoverUrl={albumCoverUrl}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {mode === 'shareable' && (
        <div className="bg-card rounded-xl border border-border p-8">
          <LyricsViewer
            lyrics={lyrics}
            mode={mode}
            currentTime={currentTime}
            isPlaying={isPlaying}
            audioUrl={audioUrl}
          />
          <LyricsControls
            mode={mode}
            onModeChange={setMode}
            lyrics={lyrics}
            songTitle={songTitle}
            artistName={artistName}
            albumCoverUrl={albumCoverUrl}
          />
        </div>
      )}
    </section>
  );
}

