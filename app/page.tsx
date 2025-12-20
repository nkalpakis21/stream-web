import { getPublicSongs, getTopSongs } from '@/lib/services/songs';
import { getPublicArtists } from '@/lib/services/artists';
import { SongCard } from '@/components/songs/SongCard';
import { ArtistCard } from '@/components/artists/ArtistCard';
import { Nav } from '@/components/navigation/Nav';

// Force dynamic rendering to always fetch fresh data from Firestore
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // Fetch public content for discovery feed
  const [songs, artists, topSongs] = await Promise.all([
    getPublicSongs(12),
    getPublicArtists(8),
    getTopSongs(12),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <Nav />

      <main className="max-w-7xl mx-auto px-6 lg:px-8 py-12 lg:py-16">
        {/* Hero Section */}
        <section className="mb-16 lg:mb-24">
          <div className="max-w-3xl">
            <h1 className="text-5xl lg:text-6xl font-bold tracking-tight mb-6 text-foreground">
              AI-Native Music
              <br />
              <span className="text-muted-foreground">Platform</span>
            </h1>
            <p className="text-xl lg:text-2xl text-muted-foreground leading-relaxed">
              Generate, collaborate, and discover music powered by AI. 
              Create unique compositions with your AI artists.
            </p>
          </div>
        </section>

        {/* Latest Songs */}
        <section className="mb-20">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold tracking-tight">Latest Songs</h2>
          </div>
          {songs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {songs.map(song => (
                <SongCard key={song.id} song={song} />
              ))}
            </div>
          ) : (
            <div className="py-16 text-center">
              <p className="text-muted-foreground text-lg">
                No songs yet. Be the first to create one!
              </p>
            </div>
          )}
        </section>

        {/* Featured Artists */}
        <section className="mb-20">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold tracking-tight">Featured Artists</h2>
          </div>
          {artists.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6">
              {artists.map(artist => (
                <ArtistCard key={artist.id} artist={artist} />
              ))}
            </div>
          ) : (
            <div className="py-16 text-center">
              <p className="text-muted-foreground text-lg">
                No artists yet. Create your first AI artist!
              </p>
            </div>
          )}
        </section>

        {/* Top Songs */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold tracking-tight">Top Songs</h2>
          </div>
          {topSongs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {topSongs.map(song => (
                <SongCard key={song.id} song={song} />
              ))}
            </div>
          ) : (
            <div className="py-16 text-center">
              <p className="text-muted-foreground text-lg">
                No songs yet. Be the first to create one!
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

