export function BagHoldingSkeleton() {
  return (
    <div className="bag-holding" aria-hidden>
      <div className="bag-holding-face bag-skel" />
      <div className="bag-holding-meta space-y-2">
        <div className="bag-skel h-3 w-28" />
        <div className="bag-skel h-3 w-16" />
      </div>
      <div className="ml-auto space-y-2">
        <div className="bag-skel ml-auto h-3 w-12" />
        <div className="bag-skel ml-auto h-3 w-8" />
      </div>
    </div>
  );
}

export function BagHoldingSkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="bag-rows">
      {Array.from({ length: count }).map((_, index) => (
        <BagHoldingSkeleton key={index} />
      ))}
    </div>
  );
}

export function BagPageSkeleton() {
  return (
    <div className="bag-page">
      <div className="bag-identity">
        <div className="bag-avatar bag-skel" />
        <div className="min-w-0 space-y-2">
          <div className="bag-skel h-5 w-36" />
          <div className="bag-skel h-3 w-40" />
        </div>
      </div>
      <div className="bag-grid">
        <div className="bag-main">
          <div className="bag-skel mb-3 h-10 w-48" />
          <div className="bag-skel mb-4 h-10 w-24" />
          <div className="bag-ranges">
            <div className="bag-skel h-11 w-12" />
            <div className="bag-skel h-11 w-12" />
            <div className="bag-skel h-11 w-14" />
            <div className="bag-skel h-11 w-12" />
          </div>
          <div className="bag-chart bag-skel" />
          <BagHoldingSkeletonList />
        </div>
        <div className="bag-side">
          <div className="bag-skel mb-3 h-5 w-24" />
          <div className="bag-skel h-32 w-full" />
        </div>
      </div>
    </div>
  );
}
