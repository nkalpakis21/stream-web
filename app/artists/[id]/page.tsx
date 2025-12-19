import { notFound } from 'next/navigation';
import { getArtist } from '@/lib/services/artists';
import { getArtistSongs } from '@/lib/services/songs';
import { ArtistCard } from '@/components/artists/ArtistCard';
import { SongCard } from '@/components/songs/SongCard';
import { formatDistanceToNow } from 'date-fns';

// Force dynamic rendering to always fetch fresh data from Firestore
export const dynamic = 'force-dynamic';

interface ArtistPageProps {
  params: {
    id: string;
  };
}

export default async function ArtistPage({ params }: ArtistPageProps) {
  const artist = await getArtist(params.id);

  if (!artist || artist.deletedAt) {
    notFound();
  }

  // Check if artist is public or user has access
  // TODO: Add auth check for private artists

  const songs = await getArtistSongs(artist.id, 20);
  const timeAgo = formatDistanceToNow(artist.createdAt.toDate(), {
    addSuffix: true,
  });

  return (
    <div className="min-h-screen">
      <nav className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <a href="/" className="text-2xl font-bold">
              Stream ⭐
            </a>
            <div className="flex gap-4 items-center">
              <a href="/discover">Discover</a>
              <a href="/artists">Artists</a>
              <a href="/create">Create</a>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-start gap-6">
            <div className="w-32 h-32 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-800 flex-shrink-0">
              {artist.avatarURL ? (
                <img
                  src={artist.avatarURL}
                  alt={artist.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-5xl">
                  {artist.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <h1 className="text-4xl font-bold mb-2">{artist.name}</h1>
              <p className="text-gray-500 mb-4">Created {timeAgo}</p>
              <p className="text-lg mb-4">{artist.lore}</p>
              
              <div className="space-y-2">
                <div>
                  <span className="font-medium">Genres:</span>{' '}
                  {artist.styleDNA.genres.join(', ') || 'None'}
                </div>
                <div>
                  <span className="font-medium">Moods:</span>{' '}
                  {artist.styleDNA.moods.join(', ') || 'None'}
                </div>
                <div>
                  <span className="font-medium">Tempo Range:</span>{' '}
                  {artist.styleDNA.tempoRange.min} - {artist.styleDNA.tempoRange.max} BPM
                </div>
                {artist.styleDNA.influences.length > 0 && (
                  <div>
                    <span className="font-medium">Influences:</span>{' '}
                    {artist.styleDNA.influences.join(', ')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <section>
          <h2 className="text-2xl font-semibold mb-6">Songs</h2>
          {songs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {songs.map(song => (
                <SongCard key={song.id} song={song} />
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No songs yet.</p>
          )}
        </section>
      </main>
    </div>
  );
}

