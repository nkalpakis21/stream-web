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
  getDocs,
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

