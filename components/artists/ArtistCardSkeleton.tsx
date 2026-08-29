export function ArtistCardSkeleton() {
  return (
    <div className="block animate-pulse text-center">
      <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-full bg-muted" />
      <div className="mx-auto h-4 w-3/4 rounded bg-muted" />
    </div>
  );
}

export function ArtistCardSkeletonGrid({ count = 16 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-6 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
      {Array.from({ length: count }).map((_, i) => (
        <ArtistCardSkeleton key={i} />
      ))}
    </div>
  );
}
