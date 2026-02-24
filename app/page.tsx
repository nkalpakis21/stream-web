import { getPublicSongs, getTopSongs, getArtistNamesForSongs } from '@/lib/services/songs';
import { SongCard } from '@/components/songs/SongCard';
import { Nav } from '@/components/navigation/Nav';
import { HeroCTA } from '@/components/homepage/HeroCTA';
import { ValuePropsSection } from '@/components/homepage/ValuePropsSection';

const SONGS_PER_SECTION = 24;

// ISR: Revalidate every 2 minutes (120 seconds)
export const revalidate = 120;

export default async function HomePage() {
  const [latestSongs, topSongs] = await Promise.all([
    getPublicSongs(SONGS_PER_SECTION),
    getTopSongs(SONGS_PER_SECTION),
  ]);

  const [latestArtistMap, topArtistMap] = await Promise.all([
    getArtistNamesForSongs(latestSongs),
    getArtistNamesForSongs(topSongs),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-purple-900 to-indigo-950">
      <Nav />

      {/* Seamless gradient: hero → value props → songs (all one flowing section) */}
      <section className="relative overflow-hidden min-h-screen">
        {/* Hero */}
        <div className="max-w-7xl mx-auto px-6 lg:px-8 pt-12 pb-16 lg:pt-16 lg:pb-24">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white">
              Create real music with AI in seconds
            </h1>
            <div className="mt-8 flex justify-center">
              <HeroCTA variant="hero" />
            </div>
          </div>
        </div>

        {/* Value Props */}
        <div className="max-w-7xl mx-auto px-6 lg:px-8 pb-12 lg:pb-16">
          <ValuePropsSection />
        </div>

        {/* Latest Songs */}
        <div className="max-w-7xl mx-auto px-6 lg:px-8 pb-16 lg:pb-20">
          <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-white/95 mb-8">
            Latest from creators
          </h2>
          {latestSongs.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3">
              {latestSongs.map((song) => (
                <SongCard
                  key={song.id}
                  song={song}
                  artistName={latestArtistMap.get(song.id)}
                  variant="glass"
                  size="compact"
                />
              ))}
            </div>
          ) : (
            <div className="py-16 text-center rounded-xl border border-white/20 border-dashed bg-white/5">
              <p className="text-white/80 text-lg mb-4">
                No songs yet. Be the first to create one!
              </p>
              <HeroCTA variant="hero" />
            </div>
          )}
        </div>

        {/* Top Songs - by play count descending */}
        <div className="max-w-7xl mx-auto px-6 lg:px-8 pb-20 lg:pb-32">
          <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-white/95 mb-8">
            Top songs
          </h2>
          {topSongs.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3">
              {topSongs.map((song) => (
                <SongCard
                  key={song.id}
                  song={song}
                  artistName={topArtistMap.get(song.id)}
                  variant="glass"
                  size="compact"
                />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center rounded-xl border border-white/10 bg-white/5">
              <p className="text-white/60 text-base">No top songs yet.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

