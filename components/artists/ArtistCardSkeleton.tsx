import './artist-card.css';

export function ArtistCardSkeleton() {
  return (
    <div className="artist-index-card animate-pulse">
      <span className="artist-index-face" />
      <div className="artist-index-name mx-auto h-5 w-3/4 rounded bg-muted" />
      <div className="artist-index-tracks mx-auto w-1/2 rounded bg-muted" />
      <div className="artist-index-pulse mx-auto h-4 w-2/3 rounded bg-muted" />
    </div>
  );
}

export function ArtistCardSkeletonGrid({ count = 16 }: { count?: number }) {
  return (
    <div className="artist-index-grid">
      {Array.from({ length: count }).map((_, i) => (
        <ArtistCardSkeleton key={i} />
      ))}
    </div>
  );
}
