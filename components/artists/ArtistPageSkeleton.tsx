import { SongCardSkeletonGrid } from '@/components/discover/SongCardSkeleton';

export function ArtistPageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl animate-pulse px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-12 flex flex-col gap-8 lg:flex-row lg:gap-12">
          <div className="relative h-32 w-32 flex-shrink-0 overflow-hidden rounded-full bg-muted ring-4 ring-border lg:h-40 lg:w-40" />
          <div className="min-w-0 flex-1 space-y-3 pt-2">
            <div className="h-8 w-48 rounded bg-muted" />
            <div className="h-4 w-32 rounded bg-muted" />
          </div>
        </div>
        <div className="mb-8 h-8 w-24 rounded bg-muted" />
        <SongCardSkeletonGrid count={8} />
      </main>
    </div>
  );
}
