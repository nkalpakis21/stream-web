'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SongDocument } from '@/types/firestore';
import { getArtistNamesForSongs } from '@/lib/services/songs';

interface PaginatedResponse {
  songs: Array<Omit<SongDocument, 'createdAt' | 'updatedAt' | 'deletedAt'> & {
    createdAt: number;
    updatedAt: number;
    deletedAt: number | null;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

interface UseInfiniteSongsOptions {
  query?: string;
  initialLimit?: number;
}

interface UseInfiniteSongsReturn {
  songs: SongDocument[];
  artistNames: Map<string, string>;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
  loadMore: () => Promise<void>;
  reset: () => void;
}

/**
 * Hook for infinite scroll song loading
 * 
 * Features:
 * - Cursor-based pagination
 * - Automatic artist name fetching
 * - Request deduplication
 * - Error handling with retry
 */
export function useInfiniteSongs(
  options: UseInfiniteSongsOptions = {}
): UseInfiniteSongsReturn {
  const { query = '', initialLimit = 20 } = options;
  
  const [songs, setSongs] = useState<SongDocument[]>([]);
  const [artistNames, setArtistNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  
  // Track current query to prevent stale updates
  const currentQueryRef = useRef<string | null>(null); // Start as null to trigger initial load
  const requestIdRef = useRef(0);
  const isLoadingRef = useRef(false);
  const hasLoadedInitialRef = useRef(false);

  // Convert serialized songs back to SongDocument format
  const deserializeSong = useCallback((song: PaginatedResponse['songs'][0]): SongDocument => {
    // Dynamically import to avoid SSR issues
    const { Timestamp } = require('firebase/firestore');
    return {
      ...song,
      createdAt: Timestamp.fromMillis(song.createdAt),
      updatedAt: Timestamp.fromMillis(song.updatedAt),
      deletedAt: song.deletedAt ? Timestamp.fromMillis(song.deletedAt) : null,
    } as SongDocument;
  }, []);

  // Fetch songs from API
  const fetchSongs = useCallback(async (
    cursorParam: string | null,
    isInitial: boolean
  ): Promise<PaginatedResponse | null> => {
    // Prevent duplicate requests
    if (isLoadingRef.current) {
      return null;
    }

    isLoadingRef.current = true;
    const requestId = ++requestIdRef.current;

    try {
      const params = new URLSearchParams({
        limit: initialLimit.toString(),
        ...(cursorParam && { cursor: cursorParam }),
        ...(query && { query }),
      });

      const response = await fetch(`/api/discover/songs?${params}`);
      
      // Check if this request is still current
      if (requestId !== requestIdRef.current || currentQueryRef.current !== query) {
        return null; // Stale request, ignore
      }

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Failed to fetch songs: ${response.statusText}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Use default error message
        }
        throw new Error(errorMessage);
      }

      const data: PaginatedResponse = await response.json();
      
      // Validate response structure
      if (!data || !Array.isArray(data.songs)) {
        throw new Error('Invalid response format from API');
      }
      
      return data;
    } catch (err) {
      if (requestId === requestIdRef.current && currentQueryRef.current === query) {
        throw err;
      }
      return null;
    } finally {
      if (requestId === requestIdRef.current) {
        isLoadingRef.current = false;
      }
    }
  }, [query, initialLimit]);

  // Load initial songs
  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSongs([]);
    setArtistNames(new Map());
    setCursor(null);
    setHasMore(true);
    currentQueryRef.current = query;

    try {
      const data = await fetchSongs(null, true);
      
      if (!data || currentQueryRef.current !== query) {
        return; // Stale request
      }

      const deserializedSongs = data.songs.map(s => deserializeSong(s));
      setSongs(deserializedSongs);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);

      // Fetch artist names
      const names = await getArtistNamesForSongs(deserializedSongs);
      if (currentQueryRef.current === query) {
        setArtistNames(names);
      }
    } catch (err) {
      console.error('[useInfiniteSongs] Error loading initial songs:', err);
      if (currentQueryRef.current === query) {
        setError(err instanceof Error ? err : new Error('Failed to load songs'));
      }
    } finally {
      if (currentQueryRef.current === query) {
        setLoading(false);
      }
    }
  }, [query, fetchSongs]);

  // Load more songs (pagination)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !cursor || isLoadingRef.current) {
      return;
    }

    setLoadingMore(true);
    setError(null);

    try {
      const data = await fetchSongs(cursor, false);
      
      if (!data || currentQueryRef.current !== query) {
        return; // Stale request
      }

      const deserializedSongs = data.songs.map(s => deserializeSong(s));
      
      // Deduplicate songs (in case of race conditions)
      setSongs(prev => {
        const existingIds = new Set(prev.map(s => s.id));
        const newSongs = deserializedSongs.filter(s => !existingIds.has(s.id));
        return [...prev, ...newSongs];
      });

      setCursor(data.nextCursor);
      setHasMore(data.hasMore);

      // Fetch artist names for new songs
      const names = await getArtistNamesForSongs(deserializedSongs);
      if (currentQueryRef.current === query) {
        setArtistNames(prev => {
          const updated = new Map(prev);
          names.forEach((name, id) => updated.set(id, name));
          return updated;
        });
      }
    } catch (err) {
      if (currentQueryRef.current === query) {
        setError(err instanceof Error ? err : new Error('Failed to load more songs'));
      }
    } finally {
      if (currentQueryRef.current === query) {
        setLoadingMore(false);
      }
    }
  }, [cursor, hasMore, loadingMore, query, fetchSongs]);

  // Reset to initial state
  const reset = useCallback(() => {
    setSongs([]);
    setArtistNames(new Map());
    setCursor(null);
    setHasMore(true);
    setError(null);
    currentQueryRef.current = query; // Update ref before loading
    hasLoadedInitialRef.current = false; // Allow reload
    loadInitial();
  }, [query, loadInitial]);

  // Load initial songs on mount or when query changes
  useEffect(() => {
    // Load on initial mount or if query changed
    if (!hasLoadedInitialRef.current || currentQueryRef.current !== query) {
      hasLoadedInitialRef.current = true;
      currentQueryRef.current = query;
      loadInitial();
    }
  }, [query, loadInitial]);

  return {
    songs,
    artistNames,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    reset,
  };
}

