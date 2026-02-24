/**
 * POST /api/songs/[id]/mint-token
 *
 * Creates an SPL token with Metaplex metadata for a song.
 * Owner-only, idempotent (returns existing mint if already created).
 *
 * Requires: Authorization: Bearer <Firebase ID Token>
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSong } from '@/lib/services/songs';
import { getArtist } from '@/lib/services/artists';
import { getSongGenerations } from '@/lib/services/generations';
import { updateSongTokenFields } from '@/lib/services/songs';
import { mintSongToken } from '@/lib/solana/mintSongToken';
import { verifyIdToken } from '@/lib/firebase/admin';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Token minting is disabled in production' },
      { status: 403 }
    );
  }

  try {
    const songId = params.id;

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required. Provide Bearer token.' },
        { status: 401 }
      );
    }

    const idToken = authHeader.slice(7);
    let decodedToken;
    try {
      decodedToken = await verifyIdToken(idToken);
    } catch (err) {
      console.error('[API /songs/[id]/mint-token] Token verification failed:', err);
      const message =
        process.env.NODE_ENV === 'development' && err instanceof Error
          ? err.message
          : 'Invalid or expired token. Ensure Firebase Admin is configured (serviceAccountKey.json or FIREBASE_SERVICE_ACCOUNT).';
      return NextResponse.json({ error: message }, { status: 401 });
    }

    const userId = decodedToken.uid;
    const song = await getSong(songId);

    if (!song || song.deletedAt) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    if (song.ownerId !== userId) {
      return NextResponse.json(
        { error: 'Only the song owner can create a token' },
        { status: 403 }
      );
    }

    if (song.tokenMintAddress) {
      return NextResponse.json({
        mintAddress: song.tokenMintAddress,
        message: 'Token already exists',
      });
    }

    const generations = await getSongGenerations(songId);
    const hasCompletedGeneration = generations.some(
      (g) => g.status === 'completed'
    );
    if (!hasCompletedGeneration) {
      return NextResponse.json(
        { error: 'Song must have at least one completed generation (audio)' },
        { status: 400 }
      );
    }

    const artist = await getArtist(song.artistId);
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || 'https://streamstar.xyz';
    const metadataUri = `${baseUrl}/api/songs/${songId}/token-metadata`;

    const mintAddress = await mintSongToken({
      song,
      artist,
      metadataUri,
    });

    const mintAddressStr =
      typeof mintAddress === 'string' ? mintAddress : String(mintAddress);
    await updateSongTokenFields(songId, mintAddressStr);

    return NextResponse.json({
      mintAddress: mintAddressStr,
    });
  } catch (error) {
    console.error('[API /songs/[id]/mint-token] Error:', error);

    if (error instanceof Error) {
      if (
        error.message.includes('SOLANA_MINT_AUTHORITY_PRIVATE_KEY') ||
        error.message.includes('insufficient')
      ) {
        return NextResponse.json(
          { error: 'Token minting is not configured or wallet has insufficient SOL' },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to create token' },
      { status: 500 }
    );
  }
}
