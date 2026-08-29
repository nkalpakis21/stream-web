import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSong } from '@/lib/services/songs';
import { getSongVersion } from '@/lib/services/songVersions';
import { getSongGenerations } from '@/lib/services/generations';
import { getArtist } from '@/lib/services/artists';
import { formatDistanceToNow } from 'date-fns';
import { getSongVersions } from '@/lib/services/songs';
import { VersionCards } from '@/components/songs/VersionCards';
import { DeveloperSection } from '@/components/songs/DeveloperSection';
import { SongOwnerActions } from '@/components/songs/SongOwnerActions';
import { SongTokenCard } from '@/components/songs/SongTokenCard';
import { ArtistCoinBuy } from '@/components/artists/ArtistCoinBuy';
import { LyricsSectionWrapper } from '@/components/lyrics/LyricsSectionWrapper';
import { SongStage } from '@/components/songs/SongStage';
import { getLyricsForSong } from '@/lib/services/lyrics';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { hasLaunchedCoin } from '@/lib/brand/coin';
import { fetchCoinQuotes } from '@/lib/solana/fetchCoinQuotes';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';

// Force dynamic rendering to always fetch fresh data from Firestore
export const dynamic = 'force-dynamic';

interface SongPageProps {
  params: {
    id: string;
  };
}

export async function generateMetadata({ params }: SongPageProps): Promise<Metadata> {
  const song = await getSong(params.id);
  
  if (!song || song.deletedAt) {
    notFound();
  }

  // Get all versions to find primary version
  const versions = await getSongVersions(song.id);
  
  // Find primary version, fallback to currentVersionId, then first version
  const primaryVersion = versions.find(v => v.isPrimary && v.audioURL) || 
                         versions.find(v => v.id === song.currentVersionId && v.audioURL) ||
                         versions.find(v => v.audioURL) ||
                         null;
  
  const [songVersion, artist] = await Promise.all([
    getSongVersion(primaryVersion?.id || song.currentVersionId),
    getArtist(song.artistId),
  ]);

  const coverImageUrl = song.albumCoverThumbnail || song.albumCoverPath;
  
  // Ensure the image URL is absolute for Open Graph
  const ogImageUrl = coverImageUrl 
    ? (coverImageUrl.startsWith('http') 
        ? coverImageUrl 
        : `${process.env.NEXT_PUBLIC_APP_URL || 'https://stream.app'}${coverImageUrl}`)
    : undefined;

  const title = song.title;
  const artistName = artist?.name || 'Unknown Artist';
  const description = `Listen to ${title} by ${artistName} on Streamstar`;

  return {
    title,
    description,
    openGraph: {
      title,
      description: `by ${artistName}`,
      type: 'music.song',
      images: ogImageUrl ? [
        {
          url: ogImageUrl,
          width: 1200,
          height: 1200,
          alt: title,
        },
      ] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: `by ${artistName}`,
      images: ogImageUrl ? [ogImageUrl] : [],
    },
  };
}

export default async function SongPage({ params }: SongPageProps) {
  const song = await getSong(params.id);

  if (!song || song.deletedAt) {
    notFound();
  }

  // Check if song is public or user has access
  // TODO: Add auth check for private songs

  const [artist, allVersions, generations] = await Promise.all([
    getArtist(song.artistId),
    getSongVersions(song.id),
    getSongGenerations(song.id),
  ]);

  // Find primary version for display - prioritize primary with audio, then currentVersionId, then any version
  const primaryVersion = allVersions.find(v => v.isPrimary && v.audioURL) || 
                         allVersions.find(v => v.id === song.currentVersionId && v.audioURL) ||
                         allVersions.find(v => v.audioURL) ||
                         null;
  
  const songVersion = primaryVersion || allVersions.find(v => v.id === song.currentVersionId) || allVersions[0];
  
  if (!songVersion) {
    notFound();
  }

  const versions = allVersions;

  const hasPendingGeneration = generations.some(g => g.status === 'pending' || g.status === 'processing');
  const timeAgo = formatDistanceToNow(song.createdAt.toDate(), {
    addSuffix: true,
  });

  // Convert Timestamp fields to plain objects for client components
  // This prevents "Only plain objects can be passed to Client Components" warnings
  const serializedVersions = versions.map(version => ({
    ...version,
    createdAt: version.createdAt.toMillis(), // Convert Timestamp to milliseconds
  }));

  // Serialize generations for client component
  const serializedGenerations = generations.map(gen => ({
    ...gen,
    createdAt: gen.createdAt.toMillis(),
    completedAt: gen.completedAt ? gen.completedAt.toMillis() : null,
  }));

  const coverImageUrl = song.albumCoverThumbnail || song.albumCoverPath;
  
  // Use primary version audio URL (already found above)
  const primaryAudioUrl = primaryVersion?.audioURL || null;

  // Get lyrics from generations
  const lyrics = getLyricsForSong(generations);

  const launched = hasLaunchedCoin(artist?.pumpFun);
  const mint = launched ? (artist?.pumpFun?.mint || '').trim() : '';
  const quotes = mint ? await fetchCoinQuotes([mint]) : new Map<string, ArtistCoinQuote>();
  const coin = mint ? quotes.get(mint) ?? null : null;
  const buyUrl = launched ? (artist?.pumpFun?.url?.trim() || null) : null;
  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://stream.app'}/songs/${song.id}`;

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <SongStage
          songId={song.id}
          songTitle={song.title}
          artistId={artist?.id || null}
          artistName={artist?.name || 'Unknown Artist'}
          albumCoverUrl={coverImageUrl}
          audioUrl={primaryAudioUrl}
          pending={hasPendingGeneration}
          durationSeconds={song.duration ?? null}
          coin={coin}
          buyUrl={buyUrl}
          shareUrl={shareUrl}
          versions={serializedVersions.map(v => ({
            id: v.id,
            audioURL: v.audioURL,
            isPrimary: v.isPrimary,
            duration: song.duration ?? null,
          }))}
        >
          {lyrics && (
            <div className="mt-8">
              <LyricsSectionWrapper
                lyrics={lyrics}
                songTitle={song.title}
                artistName={artist?.name || 'Unknown Artist'}
                albumCoverUrl={coverImageUrl}
                audioUrl={primaryAudioUrl}
              />
            </div>
          )}
        </SongStage>
        <div className="mt-6 mb-10 flex flex-col items-start gap-3">
            <SongOwnerActions
              songId={song.id}
              songTitle={song.title}
              ownerId={song.ownerId}
            />
            {song.tokenMintAddress && (
              <SongTokenCard
                songId={song.id}
                tokenMintAddress={song.tokenMintAddress}
              />
            )}
            <ArtistCoinBuy url={artist?.pumpFun?.url} />
            <p className="text-xs sm:text-sm text-muted-foreground mt-2 sm:mt-3">
              Created {timeAgo}
            </p>
        </div>

        {/* Version Cards */}
        <VersionCards
          songTitle={song.title}
          artistName={artist?.name || 'Unknown Artist'}
          artistId={artist?.id}
          albumCoverUrl={coverImageUrl}
          initialVersions={serializedVersions}
          hasPendingGeneration={hasPendingGeneration}
          songId={song.id}
          ownerId={song.ownerId}
        />

        {/* Developer Section */}
        <DeveloperSection generations={serializedGenerations} songId={song.id} />

        {/* Comments Section */}
        <CommentsSection targetType="song" targetId={song.id} />
      </main>
    </div>
  );
}

