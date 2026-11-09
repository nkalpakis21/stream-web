/**
 * Discovery Service
 * 
 * AI-native discovery (not playlist-based).
 * Supports prompt-based search, artist universes, mood/vibe filtering.
 */

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type { SongDocument, AIArtistDocument, DiscoveryQuery } from '@/types/firestore';
import { searchArtistsByName } from '@/lib/services/artists';
import { expiredSongIds, getArtistSongs, omitExpiredAudioSongs } from '@/lib/services/songs';
import { takePlayablePage } from '@/lib/songs/audioAvailability';

/**
 * Search songs by prompt (free-text search)
 * Note: Firestore doesn't support full-text search natively.
 * For production, consider using Algolia or similar.
 * This is a basic implementation that searches in song titles.
 */
export async function searchSongsByPrompt(
  searchQuery: string,
  limitCount: number = 20
): Promise<SongDocument[]> {
  // Basic implementation - in production, use a proper search service
  const q = query(
    collection(db, COLLECTIONS.songs),
    where('isPublic', '==', true),
    orderBy('createdAt', 'desc'),
    limit(limitCount * 4) // Extra rows so expired audio does not shrink the page
  );
  
  const snapshot = await getDocs(q);
  // Filter out deleted songs and by search query (case-insensitive)
  // Handle both null and undefined (for older documents without deletedAt field)
  const queryLower = searchQuery.toLowerCase();
  const allSongs = snapshot.docs
    .map(doc => doc.data() as SongDocument)
    .filter(song => !song.deletedAt && song.title.toLowerCase().includes(queryLower));

  return (await omitExpiredAudioSongs(allSongs)).slice(0, limitCount);
}

/**
 * Get songs by genres (from artist style DNA)
 */
export async function getSongsByGenres(
  genres: string[],
  limitCount: number = 20
): Promise<SongDocument[]> {
  // This requires joining with artists - simplified for now
  // In production, you might want to denormalize genre data or use a different approach
  const q = query(
    collection(db, COLLECTIONS.songs),
    where('isPublic', '==', true),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  // Filter out deleted songs in memory (Firestore doesn't handle null comparisons well)
  // Handle both null and undefined (for older documents without deletedAt field)
  const songs = snapshot.docs
    .map(doc => doc.data() as SongDocument)
    .filter(song => !song.deletedAt);
  return omitExpiredAudioSongs(songs);
}

/**
 * Get songs by artist
 */
export async function getSongsByArtist(
  artistId: string,
  limitCount: number = 20
): Promise<SongDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.songs),
    where('artistId', '==', artistId),
    where('isPublic', '==', true),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  // Filter out deleted songs in memory (Firestore doesn't handle null comparisons well)
  // Handle both null and undefined (for older documents without deletedAt field)
  const songs = snapshot.docs
    .map(doc => doc.data() as SongDocument)
    .filter(song => !song.deletedAt);
  return omitExpiredAudioSongs(songs);
}

/**
 * Get recent public songs (timeline feed)
 */
export async function getRecentSongs(
  limitCount: number = 20
): Promise<SongDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.songs),
    where('isPublic', '==', true),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  // Filter out deleted songs in memory (Firestore doesn't handle null comparisons well)
  // Handle both null and undefined (for older documents without deletedAt field)
  const songs = snapshot.docs
    .map(doc => doc.data() as SongDocument)
    .filter(song => !song.deletedAt);
  return omitExpiredAudioSongs(songs);
}

const PUBLIC_WINDOW_CAP = 100;

function publicWindowSize(limitCount: number): number {
  return Math.min(Math.max(limitCount * 4, limitCount), PUBLIC_WINDOW_CAP);
}

async function fetchPublicSongBatch(
  batchSize: number,
  cursor: string | null
): Promise<SongDocument[]> {
  const size = Math.max(1, batchSize);
  try {
    let q = query(
      collection(db, COLLECTIONS.songs),
      where('isPublic', '==', true),
      where('deletedAt', '==', null),
      orderBy('createdAt', 'desc'),
      limit(size)
    );

    if (cursor) {
      try {
        const cursorDoc = await getDoc(doc(db, COLLECTIONS.songs, cursor));
        if (cursorDoc.exists()) {
          q = query(
            collection(db, COLLECTIONS.songs),
            where('isPublic', '==', true),
            where('deletedAt', '==', null),
            orderBy('createdAt', 'desc'),
            startAfter(cursorDoc),
            limit(size)
          );
        }
      } catch (error) {
        console.warn('[getPaginatedPublicSongs] Invalid cursor, starting from beginning:', error);
      }
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(songDoc => songDoc.data() as SongDocument);
  } catch (error: any) {
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      console.warn('[getPaginatedPublicSongs] Composite index missing, using fallback');
      let q = query(
        collection(db, COLLECTIONS.songs),
        where('isPublic', '==', true),
        orderBy('createdAt', 'desc'),
        limit(size)
      );

      if (cursor) {
        try {
          const cursorDoc = await getDoc(doc(db, COLLECTIONS.songs, cursor));
          if (cursorDoc.exists()) {
            q = query(
              collection(db, COLLECTIONS.songs),
              where('isPublic', '==', true),
              orderBy('createdAt', 'desc'),
              startAfter(cursorDoc),
              limit(size)
            );
          }
        } catch (cursorError) {
          console.warn('[getPaginatedPublicSongs] Invalid cursor in fallback:', cursorError);
        }
      }

      const snapshot = await getDocs(q);
      return snapshot.docs
        .map(songDoc => songDoc.data() as SongDocument)
        .filter(song => !song.deletedAt)
        .slice(0, size);
    }
    throw error;
  }
}

/**
 * Get paginated public songs with cursor-based pagination
 * Uses the composite index: (isPublic, deletedAt, createdAt)
 * Expired audio is omitted and does not occupy a page slot.
 */
export async function getPaginatedPublicSongs(
  limitCount: number = 20,
  cursor: string | null = null
): Promise<{
  songs: SongDocument[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const window = publicWindowSize(limitCount);
  const collected: SongDocument[] = [];
  let cursorNow: string | null = cursor;
  let hasMore = false;

  for (let round = 0; round < 4 && collected.length < limitCount; round += 1) {
    const docs = await fetchPublicSongBatch(window + 1, cursorNow);
    if (docs.length === 0) {
      hasMore = false;
      cursorNow = null;
      break;
    }
    const full = docs.length > window;
    const batch = full ? docs.slice(0, window) : docs;
    const expired = await expiredSongIds(batch.map(song => song.id));
    const page = takePlayablePage(
      batch,
      song => expired.has(song.id),
      limitCount - collected.length,
      full
    );
    collected.push(...page.songs);
    hasMore = page.hasMore;
    cursorNow = page.nextCursor;
    if (!page.hasMore || collected.length >= limitCount || !cursorNow) break;
  }

  return {
    songs: collected.slice(0, limitCount),
    nextCursor: hasMore ? cursorNow : null,
    hasMore,
  };
}

/**
 * Search songs by prompt with cursor-based pagination
 */
export async function searchSongsByPromptPaginated(
  searchQuery: string,
  limitCount: number = 20,
  cursor: string | null = null
): Promise<{
  songs: SongDocument[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  // Note: This is a simplified implementation
  // For production, consider using Algolia or similar for proper full-text search
  
  const queryLower = searchQuery.toLowerCase();
  
  // Fetch a larger batch and filter in memory
  // In production, this should use a proper search service
  const fetchLimit = Math.min(limitCount * 5 + 1, 100);
  let q = query(
    collection(db, COLLECTIONS.songs),
    where('isPublic', '==', true),
    where('deletedAt', '==', null),
    orderBy('createdAt', 'desc'),
    limit(fetchLimit)
  );

  if (cursor) {
    try {
      const cursorDoc = await getDoc(doc(db, COLLECTIONS.songs, cursor));
      if (cursorDoc.exists()) {
        q = query(
          collection(db, COLLECTIONS.songs),
          where('isPublic', '==', true),
          where('deletedAt', '==', null),
          orderBy('createdAt', 'desc'),
          startAfter(cursorDoc),
          limit(fetchLimit)
        );
      }
    } catch (error) {
      console.warn('[searchSongsByPromptPaginated] Invalid cursor:', error);
    }
  }

  const snapshot = await getDocs(q);
  const titleMatches = snapshot.docs
    .map(doc => doc.data() as SongDocument)
    .filter(song =>
      !song.deletedAt &&
      song.title.toLowerCase().includes(queryLower)
    );

  const artistMatches = await searchArtistsByName(searchQuery, undefined, 8);
  const artistSongs = (
    await Promise.all(artistMatches.map(artist => getArtistSongs(artist.id, 6)))
  ).flat();

  const seen = new Set<string>();
  const allSongs: SongDocument[] = [];
  for (const song of [...titleMatches, ...artistSongs]) {
    if (seen.has(song.id) || song.deletedAt) continue;
    seen.add(song.id);
    allSongs.push(song);
  }

  const playable = await omitExpiredAudioSongs(allSongs);
  const windowFull = snapshot.docs.length >= fetchLimit;
  const hasMore = playable.length > limitCount || windowFull;
  const songs = playable.slice(0, limitCount);
  const nextCursor = hasMore
    ? songs[songs.length - 1]?.id ?? snapshot.docs[snapshot.docs.length - 1]?.id ?? null
    : null;

  return {
    songs,
    nextCursor,
    hasMore,
  };
}

/**
 * General discovery query
 */
export async function discoverContent(
  query: DiscoveryQuery
): Promise<{
  songs: SongDocument[];
  artists: AIArtistDocument[];
}> {
  const songs: SongDocument[] = [];
  const artists: AIArtistDocument[] = [];

  // Handle different query types
  if (query.prompt) {
    const promptSongs = await searchSongsByPrompt(query.prompt, query.limit);
    songs.push(...promptSongs);
  } else if (query.artistId) {
    const artistSongs = await getSongsByArtist(query.artistId, query.limit);
    songs.push(...artistSongs);
  } else {
    const recentSongs = await getRecentSongs(query.limit || 20);
    songs.push(...recentSongs);
  }

  // Get artists if needed
  if (query.artistId) {
    const { getArtist } = await import('./artists');
    const artist = await getArtist(query.artistId);
    if (artist) {
      artists.push(artist);
    }
  }

  return { songs, artists };
}

