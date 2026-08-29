/**
 * Skeleton for SongCard — square PlayableArt + play circle + title/artist.
 */
export function SongCardSkeleton() {
  return (
    <article className="block animate-pulse rounded-[12px] bg-card">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
        <span className="absolute inset-0 z-10 m-auto flex h-12 w-12 rounded-full bg-black/55" />
      </div>
      <div className="p-3">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="mt-0.5 h-3 w-1/2 rounded bg-muted" />
      </div>
    </article>
  );
}

export function SongCardSkeletonGrid({
  count = 12,
  className = 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <SongCardSkeleton key={i} />
      ))}
    </div>
  );
}
