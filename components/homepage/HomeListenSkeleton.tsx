function HeatRowSkeleton() {
  return (
    <li className="flex items-center gap-3 rounded-xl px-1 py-2.5">
      <span className="h-3 w-5 rounded bg-muted" />
      <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-cover bg-muted" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
      <div className="h-4 w-4 flex-shrink-0 rounded bg-muted" />
    </li>
  );
}

function LiveTileSkeleton() {
  return (
    <div className="w-[44vw] flex-shrink-0 sm:w-auto">
      <div className="relative aspect-square overflow-hidden rounded-cover bg-muted">
        <span className="absolute inset-0 z-10 m-auto flex h-14 w-14 rounded-full bg-black/55" />
      </div>
      <div className="mt-2 h-4 w-3/4 rounded bg-muted" />
      <div className="mt-1 h-3 w-1/2 rounded bg-muted" />
    </div>
  );
}

export function HomeListenSkeleton() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse px-4 py-6 sm:px-6 sm:py-10">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <section className="rounded-xl border border-white/10 bg-card/60 p-4 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative w-full max-w-[280px] sm:w-[240px] sm:max-w-none">
              <div className="relative aspect-square overflow-hidden rounded-cover bg-muted">
                <span className="absolute inset-0 z-10 m-auto flex h-14 w-14 rounded-full bg-black/55" />
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="h-9 w-2/3 rounded bg-muted" />
              <div className="h-4 w-1/3 rounded bg-muted" />
              <div className="flex flex-wrap gap-3 pt-2">
                <div className="h-10 w-20 rounded-xl bg-muted" />
                <div className="h-10 w-24 rounded-xl bg-muted" />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-card/60 p-4 sm:p-5">
          <div className="mb-3 h-4 w-12 rounded bg-muted" />
          <ol className="flex flex-col">
            {Array.from({ length: 6 }).map((_, i) => (
              <HeatRowSkeleton key={i} />
            ))}
          </ol>
        </section>
      </div>

      <section className="mt-10">
        <div className="mb-4 h-8 w-16 rounded bg-muted" />
        <div className="-mx-4 flex gap-4 overflow-hidden px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <LiveTileSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
