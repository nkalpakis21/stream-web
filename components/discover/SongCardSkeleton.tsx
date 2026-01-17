'use client';

/**
 * Skeleton loader for SongCard
 * Matches the exact dimensions and layout of SongCard
 */
export function SongCardSkeleton() {
  return (
    <div className="bg-card rounded-xl overflow-hidden shadow-soft animate-pulse">
      <div className="w-full aspect-square bg-muted" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-1/2" />
        <div className="h-3 bg-muted rounded w-1/3" />
      </div>
    </div>
  );
}


