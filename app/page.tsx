import { getPublicSongs, getTopSongs, getArtistNamesForSongs } from '@/lib/services/songs';
import { V0Navbar } from '@/components/navigation/V0Navbar';
import { Hero } from '@/components/homepage/v0/Hero';
import { LatestSongs } from '@/components/homepage/v0/LatestSongs';
import { Features } from '@/components/homepage/v0/Features';
import { CtaSection } from '@/components/homepage/v0/CtaSection';

const SONGS_PER_SECTION = 24;

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
    <main className="min-h-screen bg-background">
      <V0Navbar />
      <Hero />
      <LatestSongs
        latestSongs={latestSongs}
        topSongs={topSongs}
        latestArtistMap={latestArtistMap}
        topArtistMap={topArtistMap}
      />
      <Features />
      <CtaSection />
    </main>
  );
}
