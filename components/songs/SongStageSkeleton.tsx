import { CommentSkeletonList } from '@/components/comments/CommentSkeleton';

export function SongStageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <div className="grid animate-pulse gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
          <div className="relative aspect-square overflow-hidden rounded-cover bg-muted">
            <span className="absolute inset-0 z-10 m-auto flex h-14 w-14 rounded-full bg-black/55" />
          </div>
          <div className="min-w-0 space-y-3">
            <div className="h-9 w-2/3 rounded bg-muted" />
            <div className="h-6 w-1/3 rounded bg-muted" />
          </div>
        </div>
        <div className="mb-10 mt-6 h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="mb-10 h-28 animate-pulse rounded-xl bg-muted" />
        <div className="mt-12 border-t border-border pt-8">
          <h2 className="mb-6 text-2xl font-bold">Comments</h2>
          <CommentSkeletonList />
        </div>
      </main>
    </div>
  );
}
