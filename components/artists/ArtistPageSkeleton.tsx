import { SongCardSkeletonGrid } from '@/components/discover/SongCardSkeleton';

export function ArtistPageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl animate-pulse px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-12 flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
          <div className="flex min-w-0 flex-1 gap-5">
            <div className="h-[120px] w-[120px] flex-shrink-0 overflow-hidden rounded-full bg-muted" />
            <div className="min-w-0 flex-1 space-y-3 pt-2">
              <div className="h-10 w-48 rounded bg-muted" />
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="flex gap-3 pt-1">
                <div className="h-12 w-24 rounded-xl bg-muted" />
                <div className="h-10 w-24 rounded-xl bg-muted" />
              </div>
            </div>
          </div>
        </div>
        <div className="mb-8 h-8 w-24 rounded bg-muted" />
        <SongCardSkeletonGrid count={8} />
      </main>
    </div>
  );
}
