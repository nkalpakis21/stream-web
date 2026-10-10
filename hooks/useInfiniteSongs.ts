'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SongDocument } from '@/types/firestore';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import type { ArtistCardDisplay } from '@/lib/artists/cardDisplay';
import type { CoinBadgeMeta } from '@/lib/brand/coin';

interface PaginatedResponse {
  songs: Array<Omit<SongDocument, 'createdAt' | 'updatedAt' | 'deletedAt'> & {
    createdAt: number;
    updatedAt: number;
    deletedAt: number | null;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
  artists?: Record<string, ArtistCardDisplay>;
  artistCoins?: Record<string, { ticker: string | null; coinIcon: string | null; quote: ArtistCoinQuote | null }>;
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
  artists: Map<string, ArtistCardDisplay>;
  coinBadgeBySong: Map<string, CoinBadgeMeta>;
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
  const [artists, setArtists] = useState<Map<string, ArtistCardDisplay>>(new Map());
  const [coinBadgeBySong, setCoinBadgeBySong] = useState<Map<string, CoinBadgeMeta>>(new Map());
  const [quoteBySong, setQuoteBySong] = useState<Map<string, ArtistCoinQuote>>(new Map());
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

  const attachArtistMeta = useCallback((
    deserializedSongs: SongDocument[],
    payload: Pick<PaginatedResponse, 'artists' | 'artistCoins'>,
    merge: boolean
  ) => {
    const nextArtists = new Map<string, ArtistCardDisplay>();
    Object.values(payload.artists || {}).forEach(artist => {
      if (artist?.id && artist.name) nextArtists.set(artist.id, artist);
    });
    const names = new Map<string, string>();
    const badges = new Map<string, CoinBadgeMeta>();
    const quotes = new Map<string, ArtistCoinQuote>();
    deserializedSongs.forEach(song => {
      const artist = nextArtists.get(song.artistId);
      if (artist?.name) names.set(song.id, artist.name);
      const coin = payload.artistCoins?.[song.artistId];
      if (coin?.ticker) {
        badges.set(song.id, { ticker: coin.ticker, iconSrc: coin.coinIcon });
      }
      if (coin?.quote) quotes.set(song.id, coin.quote);
    });
    if (currentKeyRef.current !== key) return;

    if (merge) {
      setArtists(prev => new Map([...prev, ...nextArtists]));
      setArtistNames(prev => new Map([...prev, ...names]));
      setCoinBadgeBySong(prev => {
        const updated = new Map(prev);
        deserializedSongs.forEach(song => {
          const badge = badges.get(song.id);
          if (badge) updated.set(song.id, badge);
          else updated.delete(song.id);
        });
        return updated;
      });
      setQuoteBySong(prev => new Map([...prev, ...quotes]));
      return;
    }

    setArtists(nextArtists);
    setArtistNames(names);
    setCoinBadgeBySong(badges);
    setQuoteBySong(quotes);
  }, [key]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSongs([]);
    setArtistNames(new Map());
    setArtists(new Map());
    setCoinBadgeBySong(new Map());
    setQuoteBySong(new Map());
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
      attachArtistMeta(deserializedSongs, data, false);
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
      attachArtistMeta(deserializedSongs, data, true);
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
    setArtists(new Map());
    setCoinBadgeBySong(new Map());
    setQuoteBySong(new Map());
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
    artists,
    coinBadgeBySong,
    quoteBySong,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    reset,
  };
}
