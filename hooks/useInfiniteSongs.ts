'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AIArtistDocument, SongDocument } from '@/types/firestore';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import { getArtistNamesForSongs } from '@/lib/services/songs';
import { getArtistsData } from '@/lib/services/artists';
import { hasLaunchedCoin } from '@/lib/brand/coin';

interface PaginatedResponse {
  songs: Array<Omit<SongDocument, 'createdAt' | 'updatedAt' | 'deletedAt'> & {
    createdAt: number;
    updatedAt: number;
    deletedAt: number | null;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

export type DiscoverSort = 'heat' | 'new';

interface UseInfiniteSongsOptions {
  query?: string;
  sort?: DiscoverSort;
  initialLimit?: number;
}

interface UseInfiniteSongsReturn {
  songs: SongDocument[];
  artistNames: Map<string, string>;
  coinBySong: Map<string, boolean>;
  quoteBySong: Map<string, ArtistCoinQuote>;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
  loadMore: () => Promise<void>;
  reset: () => void;
}

function requestKey(query: string, sort: DiscoverSort) {
  return `${query}::${sort}`;
}

async function fetchQuotesForArtists(
  artists: Map<string, AIArtistDocument>,
  cache: Map<string, ArtistCoinQuote>
): Promise<Map<string, ArtistCoinQuote>> {
  const needed: string[] = [];
  artists.forEach(artist => {
    const mint = artist.pumpFun?.mint?.trim();
    if (mint && hasLaunchedCoin(artist.pumpFun) && !cache.has(mint)) {
      needed.push(mint);
    }
  });

  if (needed.length === 0) return cache;

  try {
    const params = new URLSearchParams({ mints: needed.join(',') });
    const res = await fetch(`/api/coin-quotes?${params}`);
    if (!res.ok) return cache;
    const body = (await res.json()) as { quotes?: Record<string, ArtistCoinQuote> };
    Object.entries(body.quotes || {}).forEach(([mint, quote]) => {
      cache.set(mint, quote);
    });
  } catch {
    return cache;
  }

  return cache;
}

function quotesForSongs(
  songs: SongDocument[],
  artists: Map<string, AIArtistDocument>,
  cache: Map<string, ArtistCoinQuote>
): Map<string, ArtistCoinQuote> {
  const bySong = new Map<string, ArtistCoinQuote>();
  songs.forEach(song => {
    const mint = artists.get(song.artistId)?.pumpFun?.mint?.trim();
    if (!mint) return;
    const quote = cache.get(mint);
    if (quote) bySong.set(song.id, quote);
  });
  return bySong;
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
  const { query = '', sort = 'new', initialLimit = 20 } = options;
  const key = requestKey(query, sort);
  
  const [songs, setSongs] = useState<SongDocument[]>([]);
  const [artistNames, setArtistNames] = useState<Map<string, string>>(new Map());
  const [coinBySong, setCoinBySong] = useState<Map<string, boolean>>(new Map());
  const [quoteBySong, setQuoteBySong] = useState<Map<string, ArtistCoinQuote>>(new Map());
  const quotesByMintRef = useRef<Map<string, ArtistCoinQuote>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  
  const currentKeyRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const isLoadingRef = useRef(false);
  const hasLoadedInitialRef = useRef(false);

  const deserializeSong = useCallback((song: PaginatedResponse['songs'][0]): SongDocument => {
    const { Timestamp } = require('firebase/firestore');
    return {
      ...song,
      createdAt: Timestamp.fromMillis(song.createdAt),
      updatedAt: Timestamp.fromMillis(song.updatedAt),
      deletedAt: song.deletedAt ? Timestamp.fromMillis(song.deletedAt) : null,
    } as SongDocument;
  }, []);

  const fetchSongs = useCallback(async (
    cursorParam: string | null,
  ): Promise<PaginatedResponse | null> => {
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
        ...(!query && sort === 'heat' ? { sort: 'heat' } : {}),
      });

      const response = await fetch(`/api/discover/songs?${params}`);
      
      if (requestId !== requestIdRef.current || currentKeyRef.current !== key) {
        return null;
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
      
      if (!data || !Array.isArray(data.songs)) {
        throw new Error('Invalid response format from API');
      }
      
      return data;
    } catch (err) {
      if (requestId === requestIdRef.current && currentKeyRef.current === key) {
        throw err;
      }
      return null;
    } finally {
      if (requestId === requestIdRef.current) {
        isLoadingRef.current = false;
      }
    }
  }, [query, sort, key, initialLimit]);

  const attachArtistMeta = useCallback(async (
    deserializedSongs: SongDocument[],
    merge: boolean
  ) => {
    const [names, artists] = await Promise.all([
      getArtistNamesForSongs(deserializedSongs),
      getArtistsData(deserializedSongs.map(s => s.artistId)),
    ]);
    if (currentKeyRef.current !== key) return;

    await fetchQuotesForArtists(artists, quotesByMintRef.current);
    if (currentKeyRef.current !== key) return;

    const quotes = quotesForSongs(deserializedSongs, artists, quotesByMintRef.current);

    if (merge) {
      setArtistNames(prev => {
        const updated = new Map(prev);
        names.forEach((name, id) => updated.set(id, name));
        return updated;
      });
      setCoinBySong(prev => {
        const updated = new Map(prev);
        deserializedSongs.forEach(song => {
          updated.set(song.id, hasLaunchedCoin(artists.get(song.artistId)?.pumpFun));
        });
        return updated;
      });
      setQuoteBySong(prev => {
        const updated = new Map(prev);
        quotes.forEach((quote, id) => updated.set(id, quote));
        return updated;
      });
      return;
    }

    setArtistNames(names);
    const coins = new Map<string, boolean>();
    deserializedSongs.forEach(song => {
      coins.set(song.id, hasLaunchedCoin(artists.get(song.artistId)?.pumpFun));
    });
    setCoinBySong(coins);
    setQuoteBySong(quotes);
  }, [key]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSongs([]);
    setArtistNames(new Map());
    setCoinBySong(new Map());
    setQuoteBySong(new Map());
    quotesByMintRef.current = new Map();
    setCursor(null);
    setHasMore(true);
    currentKeyRef.current = key;

    try {
      const data = await fetchSongs(null);
      
      if (!data || currentKeyRef.current !== key) {
        return;
      }

      const deserializedSongs = data.songs.map(s => deserializeSong(s));
      setSongs(deserializedSongs);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
      await attachArtistMeta(deserializedSongs, false);
    } catch (err) {
      console.error('[useInfiniteSongs] Error loading initial songs:', err);
      if (currentKeyRef.current === key) {
        setError(err instanceof Error ? err : new Error('Failed to load songs'));
      }
    } finally {
      setLoading(false);
    }
  }, [key, fetchSongs, deserializeSong, attachArtistMeta]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !cursor || isLoadingRef.current) {
      return;
    }

    setLoadingMore(true);
    setError(null);

    try {
      const data = await fetchSongs(cursor);
      
      if (!data || currentKeyRef.current !== key) {
        return;
      }

      const deserializedSongs = data.songs.map(s => deserializeSong(s));
      
      setSongs(prev => {
        const existingIds = new Set(prev.map(s => s.id));
        const newSongs = deserializedSongs.filter(s => !existingIds.has(s.id));
        return [...prev, ...newSongs];
      });

      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
      await attachArtistMeta(deserializedSongs, true);
    } catch (err) {
      if (currentKeyRef.current === key) {
        setError(err instanceof Error ? err : new Error('Failed to load more songs'));
      }
    } finally {
      if (currentKeyRef.current === key) {
        setLoadingMore(false);
      }
    }
  }, [cursor, hasMore, loadingMore, key, fetchSongs, deserializeSong, attachArtistMeta]);

  const reset = useCallback(() => {
    setSongs([]);
    setArtistNames(new Map());
    setCoinBySong(new Map());
    setQuoteBySong(new Map());
    quotesByMintRef.current = new Map();
    setCursor(null);
    setHasMore(true);
    setError(null);
    currentKeyRef.current = key;
    hasLoadedInitialRef.current = false;
    loadInitial();
  }, [key, loadInitial]);

  useEffect(() => {
    if (!hasLoadedInitialRef.current || currentKeyRef.current !== key) {
      hasLoadedInitialRef.current = true;
      currentKeyRef.current = key;
      loadInitial();
    }
  }, [key, loadInitial]);

  return {
    songs,
    artistNames,
    coinBySong,
    quoteBySong,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    reset,
  };
}
