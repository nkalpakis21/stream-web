'use client';

import { useEffect, useRef } from 'react';

interface InfiniteScrollSentinelProps {
  onIntersect: () => void;
  enabled: boolean;
}

/**
 * Sentinel component for infinite scroll detection
 * Uses Intersection Observer API for efficient scroll detection
 */
export function InfiniteScrollSentinel({ onIntersect, enabled }: InfiniteScrollSentinelProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Trigger when sentinel enters viewport
        if (entries[0].isIntersecting) {
          onIntersect();
        }
      },
      {
        root: null, // viewport
        rootMargin: '200px', // Trigger 200px before reaching bottom
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [onIntersect, enabled]);

  return (
    <div
      ref={sentinelRef}
      className="h-1 w-full"
      aria-hidden="true"
    />
  );
}


