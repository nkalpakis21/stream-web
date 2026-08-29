'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { DiscoverSongCard } from '@/components/discover/DiscoverSongCard';
import { InfiniteScrollSentinel } from '@/components/discover/InfiniteScrollSentinel';
import { SongCardSkeleton, SongCardSkeletonGrid } from '@/components/discover/SongCardSkeleton';
import { EmptyAction } from '@/components/states/EmptyAction';
import { useInfiniteSongs, type DiscoverSort } from '@/hooks/useInfiniteSongs';

function DiscoverPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 rounded-full px-5 text-sm font-semibold transition-colors"
      style={
        active
          ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
          : { background: 'transparent', color: 'var(--mute)', border: '1px solid var(--line)' }
      }
    >
      {label}
    </button>
  );
}

function parseSort(value: string | null): DiscoverSort {
  return value === 'heat' ? 'heat' : 'new';
}

function DiscoverPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = (searchParams.get('q') || '').trim();
  const urlSort = parseSort(searchParams.get('sort'));

  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const [activeQuery, setActiveQuery] = useState(urlQuery);
  const [sort, setSort] = useState<DiscoverSort>(urlSort);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    songs,
    artistNames,
    coinBySong,
    quoteBySong,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    reset,
  } = useInfiniteSongs({ query: activeQuery, sort });

  const writeUrl = useCallback((nextQuery: string, nextSort: DiscoverSort) => {
    const params = new URLSearchParams();
    if (nextQuery) params.set('q', nextQuery);
    else if (nextSort === 'heat') params.set('sort', 'heat');
    else params.set('sort', 'new');
    const qs = params.toString();
    router.replace(qs ? `/discover?${qs}` : '/discover', { scroll: false });
  }, [router]);

  useEffect(() => {
    setSearchQuery(urlQuery);
    setActiveQuery(urlQuery);
    setSort(urlSort);
  }, [urlQuery, urlSort]);

  const commitSearch = useCallback((value: string) => {
    const next = value.trim();
    if (!next) return;
    setActiveQuery(next);
    setSearchQuery(next);
    writeUrl(next, sort);
  }, [sort, writeUrl]);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    commitSearch(searchQuery);
  }, [commitSearch, searchQuery]);

  const handleChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = value.trim();
      if (!next) return;
      setActiveQuery(next);
      writeUrl(next, sort);
    }, 350);
  }, [sort, writeUrl]);

  const handlePill = useCallback((next: DiscoverSort) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchQuery('');
    setActiveQuery('');
    setSort(next);
    writeUrl('', next);
  }, [writeUrl]);

  const handleClear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchQuery('');
    setActiveQuery('');
    writeUrl('', sort);
  }, [sort, writeUrl]);

  const canSearch = Boolean(searchQuery.trim());

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <section className="mb-12">
          <h1 className="listen-h1 mb-8">Discover</h1>

          <form onSubmit={handleSearch} className="mb-6 flex gap-2">
            <label className="relative block min-w-0 flex-1">
              <span className="sr-only">Search</span>
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2"
                style={{ color: 'var(--mute)' }}
                aria-hidden
              />
              <input
                type="search"
                value={searchQuery}
                onChange={e => handleChange(e.target.value)}
                placeholder="Songs, artists, titles."
                className="h-12 w-full border bg-card pl-12 pr-5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                style={{
                  borderRadius: 9999,
                  borderColor: 'var(--line)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                }}
              />
            </label>
            <button
              type="submit"
              disabled={!canSearch}
              className="listen-btn-primary disabled:opacity-50"
            >
              Search
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            <DiscoverPill label="Heat" active={sort === 'heat' && !activeQuery} onClick={() => handlePill('heat')} />
            <DiscoverPill label="New" active={sort === 'new' && !activeQuery} onClick={() => handlePill('new')} />
          </div>
        </section>

        {loading ? (
          <SongCardSkeletonGrid showCluster />
        ) : error ? (
          <div className="p-12 border-2 border-dashed border-border rounded-2xl text-center bg-muted/30">
            <p className="text-muted-foreground text-lg mb-4">
              {error.message || 'Failed to load songs'}
            </p>
            <button
              onClick={reset}
              className="listen-btn-primary"
            >
              Try Again
            </button>
          </div>
        ) : songs.length === 0 ? (
          <div className="p-12 border-2 border-dashed border-border rounded-2xl text-center bg-muted/30">
            {activeQuery ? (
              <div className="space-y-4">
                <p className="text-muted-foreground text-lg">
                  0 results for {activeQuery}
                </p>
                <button type="button" onClick={handleClear} className="listen-btn-ghost">
                  Clear
                </button>
              </div>
            ) : (
              <EmptyAction message="No songs yet." href="/" label="Home" />
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {songs.map((song, index) => (
                <div
                  key={song.id}
                  className="animate-in fade-in slide-in-from-bottom-4"
                  style={{
                    animationDelay: `${Math.min(index * 50, 500)}ms`,
                    animationFillMode: 'both',
                  }}
                >
                  <DiscoverSongCard
                    song={song}
                    artistName={artistNames.get(song.id)}
                    coin={quoteBySong.get(song.id) ?? null}
                    hasCoin={coinBySong.get(song.id) ?? false}
                  />
                </div>
              ))}

              {loadingMore && (
                <>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <SongCardSkeleton key={`skeleton-${i}`} showCluster />
                  ))}
                </>
              )}
            </div>

            {hasMore && !loadingMore && (
              <InfiniteScrollSentinel
                onIntersect={loadMore}
                enabled={!loading && !loadingMore}
              />
            )}

            {loadingMore && (
              <div className="py-8 text-center">
                <div className="inline-flex items-center gap-3 text-muted-foreground">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-medium">Loading more songs...</span>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={<SongCardSkeletonGrid showCluster />}>
      <DiscoverPageInner />
    </Suspense>
  );
}
