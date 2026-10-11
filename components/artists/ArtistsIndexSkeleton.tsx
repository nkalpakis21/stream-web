import { ArtistCardSkeletonGrid } from '@/components/artists/ArtistCardSkeleton';
import '@/components/artists/artist-card.css';

/** Index grid only. Not used above /artists/[id], which must be able to 404. */
export function ArtistsIndexSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-12 flex items-center justify-between">
          <h1 className="listen-h1">All Artists</h1>
        </div>
        <ArtistCardSkeletonGrid />
      </main>
    </div>
  );
}
