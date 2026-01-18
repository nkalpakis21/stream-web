'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { SongCard } from '@/components/songs/SongCard';
import { getArtistNamesForSongs } from '@/lib/services/songs';
import type { SongDocument } from '@/types/firestore';
import { InfiniteScrollSentinel } from '@/components/discover/InfiniteScrollSentinel';

interface PaginatedResponse {
  songs: Array<{
    id: string;
    createdAt: number;
    updatedAt: number;
    deletedAt: number | null;
    [key: string]: unknown;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

export function FeedPageClient() {
  const { user } = useAuth();
  const [songs, setSongs] = useState<SongDocument[]>([]);
  const [artistNames, setArtistNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  
  const currentUserIdRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const isLoadingRef = useRef(false);
  const hasLoadedInitialRef = useRef(false);

  // Convert serialized songs back to SongDocument format
  const deserializeSong = useCallback((song: PaginatedResponse['songs'][0]): SongDocument => {
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
    if (!user) return null;

    // Prevent duplicate requests
    if (isLoadingRef.current) {
      return null;
    }

    isLoadingRef.current = true;
    const requestId = ++requestIdRef.current;

    try {
      const params = new URLSearchParams({
        userId: user.uid,
        limit: '20',
        ...(cursorParam && { cursor: cursorParam }),
      });

      const response = await fetch(`/api/feed?${params}`);
      
      // Check if this request is still current
      if (requestId !== requestIdRef.current || currentUserIdRef.current !== user.uid) {
        return null; // Stale request, ignore
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch feed: ${response.statusText}`);
      }

      const data = await response.json();
      return data as PaginatedResponse;
    } catch (err) {
      if (requestId === requestIdRef.current && currentUserIdRef.current === user.uid) {
        throw err;
      }
      return null;
    } finally {
      if (requestId === requestIdRef.current) {
        isLoadingRef.current = false;
      }
    }
  }, [user, deserializeSong]);

  // Load initial songs
  const loadInitial = useCallback(async () => {
    if (!user || hasLoadedInitialRef.current) return;

    currentUserIdRef.current = user.uid;
    setLoading(true);
    setError(null);
    hasLoadedInitialRef.current = true;

    try {
      const data = await fetchSongs(null, true);
      
      if (!data || currentUserIdRef.current !== user.uid) {
        return; // Stale request
      }

      const deserializedSongs = data.songs.map(s => deserializeSong(s));
      setSongs(deserializedSongs);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);

      // Fetch artist names
      const names = await getArtistNamesForSongs(deserializedSongs);
      if (currentUserIdRef.current === user.uid) {
        setArtistNames(names);
      }
    } catch (err) {
      if (currentUserIdRef.current === user.uid) {
        setError(err instanceof Error ? err : new Error('Failed to load feed'));
      }
    } finally {
      if (currentUserIdRef.current === user.uid) {
        setLoading(false);
      }
    }
  }, [user, fetchSongs, deserializeSong]);

  // Load more songs (pagination)
  const loadMore = useCallback(async () => {
    if (!user || loadingMore || !hasMore || !cursor || isLoadingRef.current) {
      return;
    }

    setLoadingMore(true);
    setError(null);

    try {
      const data = await fetchSongs(cursor, false);
      
      if (!data || currentUserIdRef.current !== user.uid) {
        return; // Stale request
      }

      const deserializedSongs = data.songs.map(s => deserializeSong(s));
      
      // Deduplicate songs
      setSongs(prev => {
        const existingIds = new Set(prev.map(s => s.id));
        const newSongs = deserializedSongs.filter(s => !existingIds.has(s.id));
        return [...prev, ...newSongs];
      });

      setCursor(data.nextCursor);
      setHasMore(data.hasMore);

      // Fetch artist names for new songs
      const names = await getArtistNamesForSongs(deserializedSongs);
      if (currentUserIdRef.current === user.uid) {
        setArtistNames(prev => {
          const updated = new Map(prev);
          names.forEach((name, id) => updated.set(id, name));
          return updated;
        });
      }
    } catch (err) {
      if (currentUserIdRef.current === user.uid) {
        setError(err instanceof Error ? err : new Error('Failed to load more songs'));
      }
    } finally {
      if (currentUserIdRef.current === user.uid) {
        setLoadingMore(false);
      }
    }
  }, [user, cursor, hasMore, loadingMore, fetchSongs, deserializeSong]);

  // Load initial songs on mount
  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // Real-time updates: Listen for new songs from followed artists
  useEffect(() => {
    if (!user) return;

    // Get followed artist IDs (simplified - in production you'd cache this)
    const setupRealtimeListener = async () => {
      try {
        const { getFollowingArtistIds } = await import('@/lib/services/follows');
        const artistIds = await getFollowingArtistIds(user.uid);

        if (artistIds.length === 0) return;

        // Firestore 'in' query limit is 10, so we need to handle multiple queries
        const batches: Array<() => void> = [];
        
        for (let i = 0; i < artistIds.length; i += 10) {
          const batch = artistIds.slice(i, i + 10);
          const q = query(
            collection(db, COLLECTIONS.songs),
            where('artistId', 'in', batch),
            where('isPublic', '==', true),
            where('deletedAt', '==', null),
            orderBy('createdAt', 'desc'),
            limit(10)
          );

          const unsubscribe = onSnapshot(q, snapshot => {
            if (currentUserIdRef.current !== user.uid) return;

            const newSongs = snapshot.docs
              .map(doc => {
                const data = doc.data() as SongDocument;
                return {
                  ...data,
                  createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
                  updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : data.updatedAt,
                  deletedAt: data.deletedAt instanceof Timestamp ? data.deletedAt.toMillis() : null,
                };
              })
              .filter(song => {
                // Only add songs that aren't already in the list
                return !songs.some(existing => existing.id === song.id);
              });

            if (newSongs.length > 0) {
              const { Timestamp } = require('firebase/firestore');
              const deserialized = newSongs.map(song => ({
                ...song,
                createdAt: Timestamp.fromMillis(song.createdAt as number),
                updatedAt: Timestamp.fromMillis(song.updatedAt as number),
                deletedAt: song.deletedAt ? Timestamp.fromMillis(song.deletedAt as number) : null,
              })) as SongDocument[];

              // Prepend new songs to the beginning
              setSongs(prev => {
                const existingIds = new Set(prev.map(s => s.id));
                const newUnique = deserialized.filter(s => !existingIds.has(s.id));
                return [...newUnique, ...prev];
              });

              // Fetch artist names for new songs
              getArtistNamesForSongs(deserialized).then(names => {
                if (currentUserIdRef.current === user.uid) {
                  setArtistNames(prev => {
                    const updated = new Map(prev);
                    names.forEach((name, id) => updated.set(id, name));
                    return updated;
                  });
                }
              });
            }
          }, (error) => {
            console.error('[FeedPageClient] Real-time listener error:', error);
          });

          batches.push(unsubscribe);
        }

        return () => {
          batches.forEach(unsubscribe => unsubscribe());
        };
      } catch (error) {
        console.error('[FeedPageClient] Failed to setup real-time listener:', error);
      }
    };

    const cleanup = setupRealtimeListener();
    return () => {
      cleanup.then(fn => fn && fn());
    };
  }, [user, songs]);

  if (!user) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground text-lg mb-4">
          Please sign in to view your feed
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-accent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="text-red-500 mb-4">{error.message}</p>
        <button
          onClick={() => {
            hasLoadedInitialRef.current = false;
            loadInitial();
          }}
          className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (songs.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground text-lg mb-4">
          Your feed is empty. Follow some artists to see their songs here!
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {songs.map(song => (
          <SongCard 
            key={song.id} 
            song={song} 
            artistName={artistNames.get(song.id)}
          />
        ))}
      </div>

      {hasMore && !loadingMore && (
        <InfiniteScrollSentinel
          onIntersect={loadMore}
          enabled={!loading && !loadingMore}
        />
      )}

      {loadingMore && (
        <div className="py-8 text-center">
          <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-accent rounded-full animate-spin mx-auto" />
        </div>
      )}
    </div>
  );
}
