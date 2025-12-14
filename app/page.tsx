import Link from 'next/link';
import { getPublicSongs } from '@/lib/services/songs';
import { getPublicArtists } from '@/lib/services/artists';
import { SongCard } from '@/components/songs/SongCard';
import { ArtistCard } from '@/components/artists/ArtistCard';

export default async function HomePage() {
  // Fetch public content for discovery feed
  const [songs, artists] = await Promise.all([
    getPublicSongs(12),
    getPublicArtists(8),
  ]);

  return (
    <div className="min-h-screen">
      <nav className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link href="/" className="text-2xl font-bold">
              Stream
            </Link>
            <div className="flex gap-4 items-center">
              <Link href="/discover">Discover</Link>
              <Link href="/artists">Artists</Link>
              <Link href="/create">Create</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <section className="mb-12">
          <h1 className="text-4xl font-bold mb-4">
            AI-Native Music Platform
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
            Generate, collaborate, and discover music powered by AI
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Latest Songs</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {songs.map(song => (
              <SongCard key={song.id} song={song} />
            ))}
          </div>
          {songs.length === 0 && (
            <p className="text-gray-500">No songs yet. Be the first to create one!</p>
          )}
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-6">Featured Artists</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            {artists.map(artist => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </div>
          {artists.length === 0 && (
            <p className="text-gray-500">No artists yet. Create your first AI artist!</p>
          )}
        </section>
      </main>
    </div>
  );
}

