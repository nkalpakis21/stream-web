import { notFound } from 'next/navigation';
import { Timestamp } from 'firebase/firestore';
import { getSong } from '@/lib/services/songs';
import { getSongVersion } from '@/lib/services/songVersions';
import { getSongGenerations } from '@/lib/services/generations';
import { getArtist } from '@/lib/services/artists';
import { formatDistanceToNow } from 'date-fns';
import { getSongVersions } from '@/lib/services/songs';
import { SongVersionsSection } from '@/components/songs/SongVersionsSection';
import { DeveloperSection } from '@/components/songs/DeveloperSection';
import { Nav } from '@/components/navigation/Nav';
import type { SongDocument } from '@/types/firestore';
import Image from 'next/image';
import Link from 'next/link';

// Force dynamic rendering to always fetch fresh data from Firestore
export const dynamic = 'force-dynamic';

interface SongPageProps {
  params: {
    id: string;
  };
}

export default async function SongPage({ params }: SongPageProps) {
  const song = await getSong(params.id);

  if (!song || song.deletedAt) {
    notFound();
  }

  // Check if song is public or user has access
  // TODO: Add auth check for private songs

  const [songVersion, artist, versions, generations] = await Promise.all([
    getSongVersion(song.currentVersionId),
    getArtist(song.artistId),
    getSongVersions(song.id),
    getSongGenerations(song.id),
  ]);

  if (!songVersion) {
    notFound();
  }

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

  // Convert Timestamp fields to plain numbers for client components
  // This prevents "Only plain objects can be passed to Client Components" warnings
  const songData = song as SongDocument;
  const serializedSong = {
    ...songData,
    createdAt: songData.createdAt.toMillis(),
    updatedAt: songData.updatedAt.toMillis(),
    deletedAt: songData.deletedAt ? songData.deletedAt.toMillis() : null,
  };

  // Serialize generations for client component
  const serializedGenerations = generations.map(gen => ({
    ...gen,
    createdAt: gen.createdAt.toMillis(),
    completedAt: gen.completedAt ? gen.completedAt.toMillis() : null,
  }));

  const coverImageUrl = song.albumCoverThumbnail || song.albumCoverPath;

  return (
    <div className="min-h-screen bg-background">
      <Nav />

      <main className="max-w-6xl mx-auto px-6 lg:px-8 py-8 lg:py-12">
        {/* Hero Section with Album Cover */}
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 mb-12">
          {/* Album Cover */}
          <div className="flex-shrink-0">
            <div className="relative w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden shadow-large bg-muted">
              {coverImageUrl ? (
                <Image
                  src={coverImageUrl}
                  alt={songVersion.title}
                  fill
                  className="object-cover"
                  sizes="320px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                  <svg
                    className="w-20 h-20 text-muted-foreground/40"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                    />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Song Info */}
          <div className="flex-1 flex flex-col justify-center">
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-4 text-foreground">
              {songVersion.title}
            </h1>
            {artist && (
              <Link
                href={`/artists/${artist.id}`}
                className="text-xl text-muted-foreground hover:text-accent transition-colors mb-3"
              >
                by {artist.name}
              </Link>
            )}
            <p className="text-sm text-muted-foreground mb-6">
              Created {timeAgo}
            </p>
            
            {/* Metadata */}
            <div className="flex flex-wrap gap-4 pt-4 border-t border-border">
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

        {/* Audio Versions */}
        <SongVersionsSection
          song={serializedSong}
          initialVersions={serializedVersions}
          hasPendingGeneration={hasPendingGeneration}
        />

        {/* Developer Section */}
        <DeveloperSection generations={serializedGenerations} songId={song.id} />
      </main>
    </div>
  );
}

