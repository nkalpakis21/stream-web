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
import type { SongDocument } from '@/types/firestore';

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

  return (
    <div className="min-h-screen">
      <nav className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <a href="/" className="text-2xl font-bold">
              Stream ⭐
            </a>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">{songVersion.title}</h1>
          {artist && (
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-2">
              by <a href={`/artists/${artist.id}`} className="hover:underline">{artist.name}</a>
            </p>
          )}
          <p className="text-sm text-gray-500">Created {timeAgo}</p>
        </div>

        <SongVersionsSection
          song={serializedSong}
          initialVersions={serializedVersions}
          hasPendingGeneration={hasPendingGeneration}
        />

        <section className="border-t border-gray-200 dark:border-gray-800 pt-8 mt-8">
          <h2 className="text-2xl font-semibold mb-4">Ownership & Metadata</h2>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Song ID:</span>{' '}
              <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                {song.id}
              </code>
            </div>
            <div>
              <span className="font-medium">Version:</span> {songVersion.versionNumber}
            </div>
            {latestGeneration?.contentHash && (
              <div>
                <span className="font-medium">Content Hash:</span>{' '}
                <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs">
                  {latestGeneration.contentHash}
                </code>
              </div>
            )}
          </div>
        </section>

        <DeveloperSection generations={serializedGenerations} songId={song.id} />
      </main>
    </div>
  );
}

