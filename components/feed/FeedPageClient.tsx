'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { SongCard } from '@/components/songs/SongCard';
import { getArtistNamesForSongs } from '@/lib/services/songs';
import type { SongDocument } from '@/types/firestore';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import { InfiniteScrollSentinel } from '@/components/discover/InfiniteScrollSentinel';
import { AuthGateCard } from '@/components/auth/AuthGateCard';
import { SongCardSkeleton, SongCardSkeletonGrid } from '@/components/discover/SongCardSkeleton';
import { FeedCoinRow, FeedCoinRowSkeleton } from '@/components/feed/FeedCoinRow';
import {
  collectLaunchedMints,
  interleaveFeedEntries,
  launchedFollowedCoins,
  type FeedCoinArtist,
  type FeedEntry,
} from '@/lib/feed/coinActivity';
import {
  listenPrimaryClass,
  listenSecondaryClass,
} from '@/components/states/BrandDeadEnd';
import Link from 'next/link';

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
  const { user, loading: authLoading } = useAuth();
  const [songs, setSongs] = useState<SongDocument[]>([]);
  const [coinArtists, setCoinArtists] = useState<FeedCoinArtist[]>([]);
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
  }, [user]);

  const loadFollowedCoins = useCallback(async (userId: string) => {
    try {
      const followedRes = await fetch(
        `/api/artists/followed?userId=${encodeURIComponent(userId)}`
      );
      if (!followedRes.ok) {
        return [] as FeedCoinArtist[];
      }
      const followedData = (await followedRes.json()) as {
        artists?: unknown[];
      };
      const artists = Array.isArray(followedData.artists)
        ? followedData.artists
        : [];
      const mints = collectLaunchedMints(artists);
      let quotes: Record<string, ArtistCoinQuote | undefined> = {};
      if (mints.length > 0) {
        const quoteRes = await fetch(
          `/api/coin-quotes?mints=${encodeURIComponent(mints.join(','))}`
        );
        if (quoteRes.ok) {
          const quoteData = (await quoteRes.json()) as {
            quotes?: Record<string, ArtistCoinQuote>;
          };
          quotes = quoteData.quotes || {};
        }
      }
      return launchedFollowedCoins(artists, quotes);
    } catch {
      return [] as FeedCoinArtist[];
    }
  }, []);

  // Load initial songs + followed launched-coin rows
  const loadInitial = useCallback(async () => {
    if (!user || hasLoadedInitialRef.current) return;

    currentUserIdRef.current = user.uid;
    setLoading(true);
    setError(null);
    hasLoadedInitialRef.current = true;

    try {
      const [data, coins] = await Promise.all([
        fetchSongs(null, true),
        loadFollowedCoins(user.uid),
      ]);

      if (currentUserIdRef.current !== user.uid) {
        return; // Stale request
      }

      if (currentUserIdRef.current === user.uid) {
        setCoinArtists(coins);
      }

      if (!data) {
        return;
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
  }, [user, fetchSongs, deserializeSong, loadFollowedCoins]);

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

  if (authLoading) {
    return (
      <SongCardSkeletonGrid
        count={12}
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      />
    );
  }

  if (!user) {
    return (
      <AuthGateCard
        headline="Sign in to view your feed"
        why="See new music and coins from artists you follow."
        returnTo="/feed"
      />
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <FeedCoinRowSkeleton />
          <FeedCoinRowSkeleton />
        </div>
        <SongCardSkeletonGrid
          count={12}
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
        />
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
          className="px-4 py-2 bg-accent text-accent-foreground rounded-xl hover:bg-accent/90 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (songs.length === 0 && coinArtists.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Nothing from artists you follow yet
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/discover" className={listenPrimaryClass}>
            Discover
          </Link>
          <Link href="/artists" className={listenSecondaryClass}>
            Artists
          </Link>
        </div>
      </div>
    );
  }

  const entries = interleaveFeedEntries(songs, coinArtists);

  return (
    <div>
      <FeedStream entries={entries} artistNames={artistNames} />

      {hasMore && !loadingMore && (
        <InfiniteScrollSentinel
          onIntersect={loadMore}
          enabled={!loading && !loadingMore}
        />
      )}

      {loadingMore && (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <SongCardSkeleton key={`more-${i}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedStream({
  entries,
  artistNames,
}: {
  entries: FeedEntry[];
  artistNames: Map<string, string>;
}) {
  const blocks: Array<
    | { type: 'coin'; artist: FeedCoinArtist }
    | { type: 'songs'; songs: SongDocument[] }
  > = [];

  for (const entry of entries) {
    if (entry.kind === 'coin') {
      blocks.push({ type: 'coin', artist: entry.artist });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last && last.type === 'songs') {
      last.songs.push(entry.song);
    } else {
      blocks.push({ type: 'songs', songs: [entry.song] });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {blocks.map(block => {
        if (block.type === 'coin') {
          return (
            <FeedCoinRow
              key={`coin:${block.artist.id}`}
              artistId={block.artist.id}
              name={block.artist.name}
              avatarURL={block.artist.avatarURL}
              quote={block.artist.quote}
              buyUrl={block.artist.buyUrl}
            />
          );
        }
        return (
          <div
            key={`songs:${block.songs[0]?.id ?? 'none'}`}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
          >
            {block.songs.map(song => (
              <SongCard
                key={song.id}
                song={song}
                artistName={artistNames.get(song.id)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
