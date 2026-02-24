/**
 * GET /api/songs/[id]/token-metadata
 *
 * Returns Metaplex-compatible off-chain metadata JSON for a song token.
 * Used as the URI when minting SPL tokens.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSong } from '@/lib/services/songs';
import { getArtist } from '@/lib/services/artists';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const songId = params.id;
    const song = await getSong(songId);

    if (!song || song.deletedAt) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    const artist = await getArtist(song.artistId);
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || 'https://streamstar.xyz';
    const songUrl = `${baseUrl}/songs/${songId}`;

    const coverPath = song.albumCoverThumbnail || song.albumCoverPath;
    const imageUrl = coverPath
      ? coverPath.startsWith('http')
        ? coverPath
        : `${baseUrl}${coverPath}`
      : undefined;

    const symbolSuffix = songId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3);
    const symbol = `STRM${symbolSuffix}`.slice(0, 6);

    const metadata = {
      name: song.title || 'Stream Song',
      symbol,
      description: `Token for "${song.title}" by ${artist?.name || 'Unknown Artist'}. Created on Stream ⭐.`,
      image: imageUrl || `${baseUrl}/icon-512x512.png`,
      external_url: songUrl,
    };

    return NextResponse.json(metadata, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('[API /songs/[id]/token-metadata] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get token metadata' },
      { status: 500 }
    );
  }
}
