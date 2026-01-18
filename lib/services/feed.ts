/**
 * Feed Service
 * 
 * Handles fetching songs from followed artists for the user's feed.
 */

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { COLLECTIONS, getSongPath } from '@/lib/firebase/collections';
import type { SongDocument } from '@/types/firestore';
import { getFollowingArtistIds } from './follows';

/**
 * Get paginated songs from artists the user follows
 * 
 * Uses Firestore `in` query (max 10 artists) or batch queries for more.
 * Returns paginated results with cursor.
 */
export async function getFollowedArtistsSongs(
  userId: string,
  limitCount: number = 20,
  cursor: string | null = null
): Promise<{
  songs: SongDocument[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  // Get list of artist IDs user is following
  const followingArtistIds = await getFollowingArtistIds(userId);

  if (followingArtistIds.length === 0) {
    return {
      songs: [],
      nextCursor: null,
      hasMore: false,
    };
  }

  // Firestore `in` query has a limit of 10 items
  // If more than 10 artists, we need to batch queries
  if (followingArtistIds.length <= 10) {
    return getSongsFromArtists(followingArtistIds, limitCount, cursor);
  } else {
    // Batch queries for more than 10 artists
    const batches: Promise<SongDocument[]>[] = [];
    for (let i = 0; i < followingArtistIds.length; i += 10) {
      const batch = followingArtistIds.slice(i, i + 10);
      batches.push(
        getSongsFromArtists(batch, limitCount * 2, null).then(result => result.songs)
      );
    }

    const allSongsArrays = await Promise.all(batches);
    const allSongs = allSongsArrays.flat();

    // Remove duplicates and sort by createdAt descending
    const uniqueSongs = Array.from(
      new Map(allSongs.map(song => [song.id, song])).values()
    ).sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

    // Apply cursor if provided
    let filteredSongs = uniqueSongs;
    if (cursor) {
      const cursorIndex = uniqueSongs.findIndex(song => song.id === cursor);
      if (cursorIndex >= 0) {
        filteredSongs = uniqueSongs.slice(cursorIndex + 1);
      }
    }

    // Apply limit
    const hasMore = filteredSongs.length > limitCount;
    const songs = filteredSongs.slice(0, limitCount);
    const nextCursor = hasMore && songs.length > 0 ? songs[songs.length - 1].id : null;

    return {
      songs,
      nextCursor,
      hasMore,
    };
  }
}

/**
 * Helper function to get songs from a list of artist IDs (max 10)
 */
async function getSongsFromArtists(
  artistIds: string[],
  limitCount: number,
  cursor: string | null
): Promise<{
  songs: SongDocument[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  try {
    let q = query(
      collection(db, COLLECTIONS.songs),
      where('artistId', 'in', artistIds),
      where('isPublic', '==', true),
      where('deletedAt', '==', null),
      orderBy('createdAt', 'desc'),
      limit(limitCount + 1) // Fetch one extra to check if there are more
    );

    // Add cursor if provided
    if (cursor) {
      try {
        const cursorDoc = await getDoc(doc(db, getSongPath(cursor)));
        if (cursorDoc.exists()) {
          q = query(
            collection(db, COLLECTIONS.songs),
            where('artistId', 'in', artistIds),
            where('isPublic', '==', true),
            where('deletedAt', '==', null),
            orderBy('createdAt', 'desc'),
            limit(limitCount + 1)
          );
          // Note: Firestore doesn't support startAfter with 'in' queries easily
          // We'll filter in memory instead
        }
      } catch (error) {
        console.warn('[getSongsFromArtists] Invalid cursor, starting from beginning:', error);
      }
    }

    const snapshot = await getDocs(q);
    const docs = snapshot.docs;

    // Filter by cursor in memory if needed (due to 'in' query limitation)
    let filteredDocs = docs;
    if (cursor) {
      const cursorIndex = docs.findIndex(d => d.id === cursor);
      if (cursorIndex >= 0) {
        filteredDocs = docs.slice(cursorIndex + 1);
      }
    }

    // Check if there are more results
    const hasMore = filteredDocs.length > limitCount;
    const songs = filteredDocs
      .slice(0, limitCount)
      .map(doc => doc.data() as SongDocument);

    // Get next cursor (last document ID)
    const nextCursor = hasMore && songs.length > 0 ? songs[songs.length - 1].id : null;

    return {
      songs,
      nextCursor,
      hasMore,
    };
  } catch (error: any) {
    // Fallback if composite index doesn't exist
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      console.warn('[getSongsFromArtists] Composite index missing, using fallback');
      
      // Fallback: fetch all songs and filter in memory
      const fallbackQuery = query(
        collection(db, COLLECTIONS.songs),
        where('isPublic', '==', true),
        orderBy('createdAt', 'desc'),
        limit(limitCount * 5) // Fetch more to account for filtering
      );
      
      const snapshot = await getDocs(fallbackQuery);
      const allSongs = snapshot.docs
        .map(doc => doc.data() as SongDocument)
        .filter(song => 
          !song.deletedAt && 
          artistIds.includes(song.artistId)
        )
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

      // Apply cursor
      let filteredSongs = allSongs;
      if (cursor) {
        const cursorIndex = allSongs.findIndex(song => song.id === cursor);
        if (cursorIndex >= 0) {
          filteredSongs = allSongs.slice(cursorIndex + 1);
        }
      }

      const hasMore = filteredSongs.length > limitCount;
      const songs = filteredSongs.slice(0, limitCount);
      const nextCursor = hasMore && songs.length > 0 ? songs[songs.length - 1].id : null;

      return {
        songs,
        nextCursor,
        hasMore,
      };
    }
    throw error;
  }
}
