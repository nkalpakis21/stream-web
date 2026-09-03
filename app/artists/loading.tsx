import { ArtistCardSkeletonGrid } from '@/components/artists/ArtistCardSkeleton';
import '@/components/artists/artist-card.css';

export default function ArtistsLoading() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-12 h-10 w-48 animate-pulse rounded bg-muted lg:h-12" />
        <ArtistCardSkeletonGrid />
      </main>
    </div>
  );
}
