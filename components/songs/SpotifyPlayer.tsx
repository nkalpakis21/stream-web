'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { X, Play, Pause, Volume2 } from 'lucide-react';
import { getProxiedAudioUrl } from '@/lib/utils/audioProxy';

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
  // Convert to proxied URL for caching (doesn't affect play logic)
  const proxiedAudioUrl = getProxiedAudioUrl(audioUrl) || audioUrl;
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playerBottom, setPlayerBottom] = useState<string>('0px');
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rafRef = useRef<number | null>(null);
  const previousBottomRef = useRef<string>('0px');
  const viewportResizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load audio when audioUrl changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !proxiedAudioUrl) return;

    // Explicitly set src before loading (ensures it's set before load() is called)
    if (audio.src !== proxiedAudioUrl) {
      audio.src = proxiedAudioUrl;
    }
    
    // Load the new audio source when URL changes
    audio.load();
  }, [proxiedAudioUrl]);

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
  }, [proxiedAudioUrl, onPlayPause]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      // Wait for audio to be ready before playing
      const playWhenReady = async () => {
        // If already ready, play immediately
        if (audio.readyState >= 2) {
          audio.play().catch(console.error);
          return;
        }
        
        // Otherwise, wait for audio to be ready
        // Use a promise-based approach to ensure we wait properly
        const waitForReady = () => {
          return new Promise<void>((resolve) => {
            // If already ready, resolve immediately
            if (audio.readyState >= 2) {
              resolve();
              return;
            }
            
            // Wait for canplay or loadeddata event
            const handleReady = () => {
              audio.removeEventListener('canplay', handleReady);
              audio.removeEventListener('canplaythrough', handleReady);
              audio.removeEventListener('loadeddata', handleReady);
              resolve();
            };
            
            audio.addEventListener('canplay', handleReady);
            audio.addEventListener('canplaythrough', handleReady);
            audio.addEventListener('loadeddata', handleReady);
            
            // Ensure audio is loading - if not, start loading
            if (audio.readyState === 0 || audio.networkState === 0) {
              audio.load();
            }
          });
        };
        
        // Wait for ready, then play
        waitForReady().then(() => {
          audio.play().catch(console.error);
        });
      };
      
      playWhenReady();
    } else {
      audio.pause();
    }
  }, [isPlaying, proxiedAudioUrl]); // Add proxiedAudioUrl to dependencies

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
    }
  }, [volume]);

  // Robust nav bar detection with proper Chrome handling
  const checkNavBar = useCallback(() => {
    // Cancel any pending checks
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    // Use requestAnimationFrame for smooth updates
    rafRef.current = requestAnimationFrame(() => {
      // Only check on mobile (width < 768px)
      const isMobile = window.innerWidth < 768;
      
      if (!isMobile) {
        // Desktop: always at bottom
        const newBottom = '0px';
        if (previousBottomRef.current !== newBottom) {
          previousBottomRef.current = newBottom;
          setPlayerBottom(newBottom);
        }
        return;
      }

      // Mobile: check if nav bar exists and measure it
      const navBar = document.querySelector('[data-mobile-nav]') as HTMLElement | null;
      
      if (navBar) {
        // Measure actual nav bar height - it already includes safe-area in its padding
        const navRect = navBar.getBoundingClientRect();
        const navHeight = navRect.height;
        
        // Nav bar height already includes safe-area-inset-bottom in its paddingBottom
        // So we just use the measured height directly
        const newBottom = `${navHeight}px`;
        
        // Only update if position actually changed to prevent flicker
        if (previousBottomRef.current !== newBottom) {
          previousBottomRef.current = newBottom;
          setPlayerBottom(newBottom);
        }
      } else {
        // No nav bar: pin to bottom (0px)
        // Safe-area is handled by paddingBottom in the style prop
        const newBottom = '0px';
        
        // Only update if position actually changed
        if (previousBottomRef.current !== newBottom) {
          previousBottomRef.current = newBottom;
          setPlayerBottom(newBottom);
        }
      }
    });
  }, []);

  // Initial synchronous check using useLayoutEffect (runs before paint)
  useLayoutEffect(() => {
    // Immediate check for initial render
    checkNavBar();
    
    // Retry with exponential backoff if nav bar not found
    let attempts = 0;
    const maxAttempts = 5;
    const checkWithRetry = () => {
      const navBar = document.querySelector('[data-mobile-nav]');
      if (!navBar && attempts < maxAttempts) {
        attempts++;
        setTimeout(checkWithRetry, Math.min(50 * Math.pow(2, attempts), 200));
      } else {
        checkNavBar();
      }
    };
    
    // Start retry sequence if needed
    setTimeout(checkWithRetry, 50);
  }, [checkNavBar]);

  // Listen to Next.js pathname changes for client-side navigation
  useEffect(() => {
    checkNavBar();
  }, [pathname, checkNavBar]);

  useEffect(() => {
    // Debounced resize handler (Chrome can fire many resize events)
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(checkNavBar, 150);
    };

    window.addEventListener('resize', handleResize, { passive: true });

    // Handle Chrome mobile viewport changes (address bar show/hide)
    const handleViewportResize = () => {
      if (viewportResizeTimeoutRef.current) {
        clearTimeout(viewportResizeTimeoutRef.current);
      }
      viewportResizeTimeoutRef.current = setTimeout(checkNavBar, 100);
    };

    // Use visualViewport API for Chrome mobile
    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
      window.visualViewport.addEventListener('scroll', handleViewportResize);
    }

    // Optimized MutationObserver - watch for nav bar changes with subtree: true
    let previousNavBarState = !!document.querySelector('[data-mobile-nav]');
    const observer = new MutationObserver(() => {
      // Check if nav bar was added/removed
      const hasNavBar = !!document.querySelector('[data-mobile-nav]');
      
      if (hasNavBar !== previousNavBarState) {
        previousNavBarState = hasNavBar;
        // Debounce the check
        if (checkTimeoutRef.current) {
          clearTimeout(checkTimeoutRef.current);
        }
        checkTimeoutRef.current = setTimeout(checkNavBar, 50);
      }
    });

    // Observe body with subtree: true to detect nested nav bar
    observer.observe(document.body, {
      childList: true,
      subtree: true, // Changed to true to detect nested nav bar
      attributes: true,
      attributeFilter: ['data-mobile-nav'], // Only watch for this attribute
    });

    // Also check on browser back/forward navigation
    const handleRouteChange = () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
      checkTimeoutRef.current = setTimeout(checkNavBar, 200);
    };
    window.addEventListener('popstate', handleRouteChange);

    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (viewportResizeTimeoutRef.current) {
        clearTimeout(viewportResizeTimeoutRef.current);
      }
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('popstate', handleRouteChange);
      if (typeof window !== 'undefined' && window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
        window.visualViewport.removeEventListener('scroll', handleViewportResize);
      }
      observer.disconnect();
    };
  }, [checkNavBar]);

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
      ref={playerRef}
      className="fixed left-0 right-0 bg-card border-t border-border z-[60] shadow-lg transition-[bottom] duration-200 ease-out" 
      style={{ 
        bottom: playerBottom, // checkNavBar already handles desktop detection
        paddingBottom: 'max(0px, env(safe-area-inset-bottom))'
      }}
    >
      <audio ref={audioRef} src={proxiedAudioUrl} preload="metadata" />
      
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

