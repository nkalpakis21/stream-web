'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { X, Play, Pause, Volume2 } from 'lucide-react';

interface SpotifyPlayerProps {
  songTitle: string;
  artistName: string;
  albumCoverUrl: string | null;
  audioUrl: string;
  isPlaying: boolean;
  onPlayPause: () => void;
  onClose: () => void;
}

export function SpotifyPlayer({
  songTitle,
  artistName,
  albumCoverUrl,
  audioUrl,
  isPlaying,
  onPlayPause,
  onClose,
}: SpotifyPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [hasMobileNav, setHasMobileNav] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      // Dispatch custom event for lyrics synchronization
      window.dispatchEvent(
        new CustomEvent('audio-timeupdate', {
          detail: { currentTime: time },
        })
      );
    };
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => {
      setCurrentTime(0);
      onPlayPause();
    };

    // Listen for seek events from lyrics
    const handleLyricsSeek = (e: Event) => {
      const customEvent = e as CustomEvent<{ timestamp: number }>;
      if (audio && !isNaN(customEvent.detail.timestamp)) {
        audio.currentTime = customEvent.detail.timestamp;
        setCurrentTime(customEvent.detail.timestamp);
      }
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);
    window.addEventListener('lyrics-seek', handleLyricsSeek);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
      window.removeEventListener('lyrics-seek', handleLyricsSeek);
    };
  }, [audioUrl, onPlayPause]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.play().catch(console.error);
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
    }
  }, [volume]);

  // Detect if mobile nav bar exists
  useEffect(() => {
    const checkNavBar = () => {
      const navBar = document.querySelector('[data-mobile-nav]');
      setHasMobileNav(!!navBar && window.innerWidth < 768);
    };

    // Check immediately
    checkNavBar();

    // Check on resize
    window.addEventListener('resize', checkNavBar);

    // Check when DOM changes (in case nav is added/removed dynamically)
    const observer = new MutationObserver(checkNavBar);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('resize', checkNavBar);
      observer.disconnect();
    };
  }, []);

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    audio.currentTime = percentage * duration;
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div 
      className="fixed left-0 right-0 bg-card border-t border-border z-[60] shadow-lg md:bottom-0" 
      style={{ 
        bottom: hasMobileNav 
          ? 'max(64px, calc(64px + env(safe-area-inset-bottom)))'
          : 'max(0px, env(safe-area-inset-bottom))',
        paddingBottom: 'max(0px, env(safe-area-inset-bottom))'
      }}
    >
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      
      <div className="max-w-7xl mx-auto px-4 py-3">
        {/* Progress Bar */}
        <div
          className="h-1 bg-muted cursor-pointer hover:h-1.5 transition-all mb-3 rounded-full overflow-hidden"
          onClick={handleProgressClick}
        >
          <div
            className="h-full bg-accent transition-all rounded-full"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* Main Player Controls */}
        <div className="flex items-center justify-between gap-4">
          {/* Left: Song Info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {albumCoverUrl ? (
              <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0 rounded-lg overflow-hidden">
                <Image
                  src={albumCoverUrl}
                  alt={songTitle}
                  fill
                  unoptimized={true}
                  className="object-cover"
                  sizes="56px"
                />
              </div>
            ) : (
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                <Play className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-foreground text-sm sm:text-base font-medium truncate">{songTitle}</div>
              <div className="text-muted-foreground text-xs sm:text-sm truncate">{artistName}</div>
            </div>
          </div>

          {/* Center: Play/Pause Button */}
          <div className="flex items-center gap-2">
            <Button
              onClick={onPlayPause}
              size="icon"
              className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-accent text-accent-foreground hover:bg-accent/90 hover:scale-105 transition-all shadow-lg"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="h-6 w-6 sm:h-7 sm:w-7" />
              ) : (
                <Play className="h-6 w-6 sm:h-7 sm:w-7 ml-0.5" />
              )}
            </Button>
          </div>

          {/* Right: Volume & Close */}
          <div className="flex items-center gap-3 flex-1 justify-end">
            {/* Volume Control - Hidden on mobile, visible on desktop */}
            <div className="hidden sm:flex items-center gap-2">
              <Volume2 className="h-5 w-5 text-muted-foreground" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                className="w-24 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-accent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                style={{
                  background: `linear-gradient(to right, hsl(var(--accent)) 0%, hsl(var(--accent)) ${volume * 100}%, hsl(var(--muted)) ${volume * 100}%, hsl(var(--muted)) 100%)`
                }}
                aria-label="Volume"
              />
            </div>

            {/* Mobile Volume Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                // Toggle mute/unmute on mobile
                const newVolume = volume > 0 ? 0 : 1;
                setVolume(newVolume);
              }}
              className="sm:hidden h-10 w-10 text-muted-foreground hover:text-foreground"
              aria-label={volume > 0 ? 'Mute' : 'Unmute'}
            >
              <Volume2 className="h-5 w-5" />
            </Button>

            {/* Close Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-10 w-10 text-muted-foreground hover:text-foreground"
              aria-label="Close player"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

