import { NextResponse } from 'next/server';
import { getPublicSongs } from '@/lib/services/songs';
import { displaysRecord, getArtistCardContext } from '@/lib/server/artistDisplay';

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

    const { displays } = songs.length > 0
      ? await getArtistCardContext(songs.map(song => song.artistId))
      : { displays: new Map() };
    const songArtistMap = new Map<string, string>();
    songs.forEach(song => {
      const name = displays.get(song.artistId)?.name;
      if (name) songArtistMap.set(song.id, name);
    });

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
      artists: displaysRecord(displays),
    });
  } catch (error) {
    console.error('[API /songs/public] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load public songs' },
      { status: 500 }
    );
  }
}



