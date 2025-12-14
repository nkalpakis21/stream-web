import { getPublicArtists } from '@/lib/services/artists';
import { ArtistCard } from '@/components/artists/ArtistCard';

export default async function ArtistsPage() {
  const artists = await getPublicArtists(50);

  return (
    <div className="min-h-screen">
      <nav className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <a href="/" className="text-2xl font-bold">
              Stream
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
        <h1 className="text-3xl font-bold mb-8">All Artists</h1>

        {artists.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            {artists.map(artist => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No artists yet. Be the first to create one!</p>
        )}
      </main>
    </div>
  );
}

