import { SongCardSkeletonGrid } from '@/components/discover/SongCardSkeleton';

/**
 * Same chrome as Discover (title, search, Heat/New) so the grid can fill in
 * without the header moving.
 */
export function DiscoverPageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="mb-12">
          <h1 className="listen-h1 mb-8">Discover</h1>
          <div
            className="mb-6 h-12 w-full rounded-xl border"
            style={{
              borderRadius: 'var(--radius, 12px)',
              borderColor: 'var(--line)',
              background: 'var(--surface-2)',
            }}
            aria-hidden
          />
          <div className="flex flex-wrap gap-2" aria-hidden>
            <div
              className="h-11 w-[4.5rem] rounded-xl"
              style={{ background: 'var(--accent)' }}
            />
            <div
              className="h-11 w-[4.5rem] rounded-xl border"
              style={{ borderColor: 'var(--line)' }}
            />
          </div>
        </section>
        <SongCardSkeletonGrid showCluster />
      </main>
    </div>
  );
}
