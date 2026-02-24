import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Timestamp } from 'firebase/firestore';
import { getSong } from '@/lib/services/songs';
import { getSongVersion } from '@/lib/services/songVersions';
import { getSongGenerations } from '@/lib/services/generations';
import { getArtist } from '@/lib/services/artists';
import { formatDistanceToNow } from 'date-fns';
import { getSongVersions } from '@/lib/services/songs';
import { VersionCards } from '@/components/songs/VersionCards';
import { DeveloperSection } from '@/components/songs/DeveloperSection';
import { SongPlayCardClient } from '@/components/songs/SongPlayCardClient';
import { ShareButton } from '@/components/songs/ShareButton';
import { SongOwnerActions } from '@/components/songs/SongOwnerActions';
import { CreateSongTokenButton } from '@/components/songs/CreateSongTokenButton';
import { SongTokenCard } from '@/components/songs/SongTokenCard';
import { Nav } from '@/components/navigation/Nav';
import { LyricsSectionWrapper } from '@/components/lyrics/LyricsSectionWrapper';
import { getLyricsForSong } from '@/lib/services/lyrics';
import { CommentsSection } from '@/components/comments/CommentsSection';
import Link from 'next/link';

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
    return {
      title: 'Song Not Found | Stream ⭐',
    };
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
  const description = `Listen to ${title} by ${artistName} on Stream ⭐`;

  return {
    title: `${title} | Stream ⭐`,
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

  const latestGeneration = generations.find(g => g.status === 'completed');
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

  return (
    <div className="min-h-screen bg-background">
      <Nav />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 lg:py-12">
        {/* Song Card with Play Functionality */}
        <div className="flex flex-col items-center mb-6 sm:mb-12">
          <SongPlayCardClient
            songTitle={song.title}
            artistName={artist?.name || 'Unknown Artist'}
            albumCoverUrl={coverImageUrl}
            audioUrl={primaryAudioUrl}
            songId={song.id}
          />
          
          {/* Song Info Below Card */}
          <div className="mt-4 sm:mt-6 text-center w-full px-2">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-1 sm:mb-2 text-foreground">
              {song.title}
            </h1>
            <div className="flex flex-col items-center gap-3">
              {artist && (
                <Link
                  href={`/artists/${artist.id}`}
                  className="text-base sm:text-lg text-muted-foreground hover:text-accent transition-colors"
                >
                  by {artist.name}
                </Link>
              )}
              <ShareButton 
                url={`${process.env.NEXT_PUBLIC_APP_URL || 'https://stream.app'}/songs/${song.id}`}
                title={song.title}
                artistName={artist?.name}
              />
            </div>
            <SongOwnerActions
              songId={song.id}
              songTitle={song.title}
              ownerId={song.ownerId}
            />
            <CreateSongTokenButton
              songId={song.id}
              ownerId={song.ownerId}
              tokenMintAddress={song.tokenMintAddress}
            />
            {song.tokenMintAddress && (
              <SongTokenCard
                songId={song.id}
                tokenMintAddress={song.tokenMintAddress}
              />
            )}
            <p className="text-xs sm:text-sm text-muted-foreground mt-2 sm:mt-3">
              Created {timeAgo}
            </p>
            
            {/* Metadata - Hidden on mobile, shown on larger screens */}
            <div className="hidden sm:flex flex-wrap gap-4 justify-center pt-4 mt-4 border-t border-border">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Version</span>
                <p className="text-sm font-medium mt-1">{songVersion.versionNumber}</p>
              </div>
              {latestGeneration?.contentHash && (
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Content Hash</span>
                  <p className="text-xs font-mono text-muted-foreground mt-1 break-all max-w-xs">
                    {latestGeneration.contentHash}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Lyrics Section - Prominently displayed */}
        {lyrics && (
          <div className="mb-16">
            <LyricsSectionWrapper
              lyrics={lyrics}
              songTitle={song.title}
              artistName={artist?.name || 'Unknown Artist'}
              albumCoverUrl={coverImageUrl}
              audioUrl={primaryAudioUrl}
            />
          </div>
        )}

        {/* Version Cards */}
        <VersionCards
          songTitle={song.title}
          artistName={artist?.name || 'Unknown Artist'}
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

