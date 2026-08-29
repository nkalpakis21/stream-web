import { SongCardSkeletonGrid } from '@/components/discover/SongCardSkeleton';

export default function FeedLoading() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-8 animate-pulse">
          <div className="mb-2 h-10 w-48 rounded bg-muted lg:h-12" />
          <div className="h-6 w-64 rounded bg-muted" />
        </div>
        <SongCardSkeletonGrid
          count={12}
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
        />
      </main>
    </div>
  );
}
