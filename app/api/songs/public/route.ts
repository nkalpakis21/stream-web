import { NextResponse } from 'next/server';
import { getPublicSongs, getArtistNamesForSongs } from '@/lib/services/songs';

/**
 * API route to fetch public songs
 * This ensures database access is server-side only
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '12', 10);
    const includeDeleted = searchParams.get('includeDeleted') === 'true';

    // Fetch songs
    const songs = await getPublicSongs(limit, { excludeDeleted: !includeDeleted });

    // Fetch artist names for songs
    const songArtistMap = songs.length > 0 
      ? await getArtistNamesForSongs(songs)
      : new Map<string, string>();

    // Serialize Firestore Timestamps to numbers for client consumption
    const serializedSongs = songs.map(song => ({
      ...song,
      createdAt: song.createdAt.toMillis(),
      updatedAt: song.updatedAt.toMillis(),
      deletedAt: song.deletedAt?.toMillis() ?? null,
    }));

    return NextResponse.json({
      songs: serializedSongs,
      songArtistMap: Object.fromEntries(songArtistMap),
    });
  } catch (error) {
    console.error('[API /songs/public] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load public songs' },
      { status: 500 }
    );
  }
}



