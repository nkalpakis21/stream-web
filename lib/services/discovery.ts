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
    limit(limitCount * 2) // Get more to account for filtering
  );
  
  const snapshot = await getDocs(q);
  // Filter out deleted songs and by search query (case-insensitive)
  // Handle both null and undefined (for older documents without deletedAt field)
  const queryLower = searchQuery.toLowerCase();
  const allSongs = snapshot.docs
    .map(doc => doc.data() as SongDocument)
    .filter(song => !song.deletedAt && song.title.toLowerCase().includes(queryLower));
  
  return allSongs.slice(0, limitCount);
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
  return snapshot.docs
    .map(doc => doc.data() as SongDocument)
    .filter(song => !song.deletedAt);
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
  return snapshot.docs
    .map(doc => doc.data() as SongDocument)
    .filter(song => !song.deletedAt);
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
  return snapshot.docs
    .map(doc => doc.data() as SongDocument)
    .filter(song => !song.deletedAt);
}

/**
 * Get paginated public songs with cursor-based pagination
 * Uses the composite index: (isPublic, deletedAt, createdAt)
 */
export async function getPaginatedPublicSongs(
  limitCount: number = 20,
  cursor: string | null = null
): Promise<{
  songs: SongDocument[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  try {
    let q = query(
      collection(db, COLLECTIONS.songs),
      where('isPublic', '==', true),
      where('deletedAt', '==', null),
      orderBy('createdAt', 'desc'),
      limit(limitCount + 1) // Fetch one extra to check if there are more
    );

    // Add cursor if provided
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
            limit(limitCount + 1)
          );
        }
      } catch (error) {
        console.warn('[getPaginatedPublicSongs] Invalid cursor, starting from beginning:', error);
      }
    }

    const snapshot = await getDocs(q);
    const docs = snapshot.docs;
    
    // Check if there are more results
    const hasMore = docs.length > limitCount;
    const songs = docs
      .slice(0, limitCount)
      .map(doc => doc.data() as SongDocument);

    // Get next cursor (last document ID)
    const nextCursor = hasMore && songs.length > 0 
      ? songs[songs.length - 1].id 
      : null;

    return {
      songs,
      nextCursor,
      hasMore,
    };
  } catch (error: any) {
    // Fallback if composite index doesn't exist
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      console.warn('[getPaginatedPublicSongs] Composite index missing, using fallback');
      
      // Simple fallback: fetch without deletedAt filter
      let q = query(
        collection(db, COLLECTIONS.songs),
        where('isPublic', '==', true),
        orderBy('createdAt', 'desc'),
        limit(limitCount * 2 + 1) // Fetch more to account for deleted songs
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
              limit(limitCount * 2 + 1)
            );
          }
        } catch (error) {
          console.warn('[getPaginatedPublicSongs] Invalid cursor in fallback:', error);
        }
      }

      const snapshot = await getDocs(q);
      const allDocs = snapshot.docs
        .map(doc => doc.data() as SongDocument)
        .filter(song => !song.deletedAt);

      const hasMore = allDocs.length > limitCount;
      const songs = allDocs.slice(0, limitCount);
      const nextCursor = hasMore && songs.length > 0 ? songs[songs.length - 1].id : null;

      return { songs, nextCursor, hasMore };
    }
    throw error;
  }
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
  let q = query(
    collection(db, COLLECTIONS.songs),
    where('isPublic', '==', true),
    where('deletedAt', '==', null),
    orderBy('createdAt', 'desc'),
    limit(limitCount * 3 + 1) // Fetch more to account for filtering
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
          limit(limitCount * 3 + 1)
        );
      }
    } catch (error) {
      console.warn('[searchSongsByPromptPaginated] Invalid cursor:', error);
    }
  }

  const snapshot = await getDocs(q);
  const allSongs = snapshot.docs
    .map(doc => doc.data() as SongDocument)
    .filter(song => 
      !song.deletedAt && 
      song.title.toLowerCase().includes(queryLower)
    );

  const hasMore = allSongs.length > limitCount;
  const songs = allSongs.slice(0, limitCount);
  const nextCursor = hasMore && songs.length > 0 ? songs[songs.length - 1].id : null;

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

