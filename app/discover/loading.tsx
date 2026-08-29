import { SongCardSkeletonGrid } from '@/components/discover/SongCardSkeleton';

export default function DiscoverLoading() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-12 animate-pulse">
          <div className="mb-8 h-10 w-48 rounded bg-muted lg:h-12" />
          <div className="mb-6 h-12 rounded-full bg-muted" />
          <div className="flex gap-2">
            <div className="h-9 w-20 rounded-full bg-muted" />
            <div className="h-9 w-24 rounded-full bg-muted" />
            <div className="h-9 w-16 rounded-full bg-muted" />
          </div>
        </div>
        <SongCardSkeletonGrid />
      </main>
    </div>
  );
}
