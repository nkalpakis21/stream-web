'use client';

import { forwardRef, useState, useEffect } from 'react';
import type { DisplayMode } from './LyricsSection';

interface LyricsLineProps {
  text: string;
  isActive: boolean;
  mode: DisplayMode;
  timestamp?: number;
  audioUrl?: string | null;
  index: number;
}

export const LyricsLine = forwardRef<HTMLDivElement, LyricsLineProps>(
  ({ text, isActive, mode, timestamp, audioUrl, index }, ref) => {
    const [isHovered, setIsHovered] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
      // Staggered entrance animation
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, index * 50); // 50ms delay per line

      return () => clearTimeout(timer);
    }, [index]);

    // Skip empty lines (but preserve spacing)
    if (!text.trim()) {
      return <div className="h-4 sm:h-6" />;
    }

    const handleClick = () => {
      if (timestamp !== undefined && audioUrl) {
        const event = new CustomEvent('lyrics-seek', {
          detail: { timestamp },
        });
        window.dispatchEvent(event);
      }
    };

    const baseClasses = 'transition-all duration-500 ease-out';
    const activeClasses = isActive
      ? 'text-accent font-semibold scale-[1.03] drop-shadow-lg'
      : 'text-foreground';
    const inactiveClasses =
      isActive || mode === 'minimal'
        ? ''
        : 'text-muted-foreground/70';

    const isClickable = timestamp !== undefined && audioUrl && mode !== 'shareable';

    return (
      <div
        ref={ref}
        className={`relative ${baseClasses} ${activeClasses} ${inactiveClasses} ${
          isClickable ? 'cursor-pointer hover:opacity-100 hover:scale-[1.01]' : ''
        } ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleClick}
        style={{
          transitionProperty: 'color, opacity, transform, filter',
          transitionDuration: isActive ? '400ms' : '300ms',
          transitionTimingFunction: isActive 
            ? 'cubic-bezier(0.34, 1.56, 0.64, 1)' // Spring for active
            : 'cubic-bezier(0.4, 0.0, 0.2, 1)', // Ease for inactive
          animationDelay: `${index * 50}ms`,
          textShadow: isActive 
            ? '0 2px 12px rgba(0, 122, 255, 0.4), 0 0 20px rgba(0, 122, 255, 0.2)' 
            : 'none',
        }}
      >
        {isActive && mode === 'immersive' && (
          <span 
            className="absolute -left-8 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-accent shadow-lg shadow-accent/50"
            style={{
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }}
          />
        )}
        <span className="relative inline-block">{text}</span>
      </div>
    );
  }
);

LyricsLine.displayName = 'LyricsLine';

