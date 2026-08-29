export function BagHoldingSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-[12px] bg-card px-3 py-3 animate-pulse">
      <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="h-3 w-16 rounded bg-muted" />
      </div>
      <div className="space-y-2 text-right">
        <div className="ml-auto h-4 w-16 rounded bg-muted" />
        <div className="ml-auto h-3 w-10 rounded bg-muted" />
      </div>
      <div className="h-12 w-16 rounded-[12px] bg-muted" />
    </div>
  );
}

export function BagHoldingSkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, index) => (
        <BagHoldingSkeleton key={index} />
      ))}
    </div>
  );
}
