'use client';

import { useEffect, useRef } from 'react';
import { getProxiedAudioUrl } from '@/lib/utils/audioProxy';

interface SongAudio {
  id: string;
  audioUrl: string | null;
}

interface AudioPreloaderProps {
  songs: SongAudio[];
}

/**
 * AudioPreloader Component
 * 
 * Preloads audio files for songs using HTML5 audio preloading.
 * Uses Intersection Observer to preload audio as songs come into viewport.
 * This ensures instant playback when users click play.
 */
export function AudioPreloader({ songs }: AudioPreloaderProps) {
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Filter out songs without audio URLs
    const songsWithAudio = songs.filter(song => song.audioUrl && song.audioUrl.trim() !== '');

    if (songsWithAudio.length === 0) {
      return;
    }

    // Create audio elements for all songs
    songsWithAudio.forEach((song, index) => {
      if (!song.audioUrl) return;

      // Use proxied URL for S3 audio files to enable caching
      const proxiedUrl = getProxiedAudioUrl(song.audioUrl) || song.audioUrl;

      // Create audio element for preloading
      const audio = document.createElement('audio');
      audio.preload = 'auto'; // Preload full audio file
      audio.src = proxiedUrl;
      audio.setAttribute('data-song-id', song.id);
      audio.setAttribute('preload', 'auto');
      
      // Hide audio element
      audio.style.display = 'none';
      audio.style.position = 'absolute';
      audio.style.visibility = 'hidden';
      
      // Store reference for cleanup
      audioRefs.current.set(song.id, audio);
      
      // Append to document body (hidden)
      document.body.appendChild(audio);
      
      // Preload immediately for first 20 songs (above the fold and initial scroll)
      if (index < 20) {
        audio.load();
      }
      
      // Handle errors silently
      audio.addEventListener('error', () => {
        // Silently handle preload errors (e.g., CORS, network issues)
        console.debug(`[AudioPreloader] Failed to preload audio for song ${song.id}`);
      });
    });

    // Create Intersection Observer to preload audio as songs come into view
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const songId = entry.target.getAttribute('data-song-id');
            if (songId) {
              const audio = audioRefs.current.get(songId);
              if (audio) {
                // Preload audio when song comes into viewport
                audio.load();
              }
            }
          }
        });
      },
      {
        // Start preloading when song is 200px away from viewport
        rootMargin: '200px',
        threshold: 0,
      }
    );

    // Observe all song placeholders
    if (containerRef.current) {
      const placeholders = containerRef.current.querySelectorAll('[data-song-id]');
      placeholders.forEach((placeholder) => {
        observerRef.current?.observe(placeholder);
      });
    }

    return () => {
      // Cleanup: disconnect observer and remove audio elements
      observerRef.current?.disconnect();
      audioRefs.current.forEach((audio) => {
        try {
          audio.pause();
          audio.src = '';
          audio.remove();
        } catch (error) {
          // Ignore cleanup errors
        }
      });
      audioRefs.current.clear();
    };
  }, [songs]);

  // Filter out songs without audio URLs
  const songsWithAudio = songs.filter(song => song.audioUrl && song.audioUrl.trim() !== '');

  if (songsWithAudio.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="hidden" aria-hidden="true">
      {/* Hidden placeholders for Intersection Observer */}
      {songsWithAudio.map((song) => (
        <div
          key={song.id}
          data-song-id={song.id}
          style={{ display: 'none' }}
        />
      ))}
    </div>
  );
}
