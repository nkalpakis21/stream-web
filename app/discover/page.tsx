'use client';

import { useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import { SongCard } from '@/components/songs/SongCard';
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
      className="h-11 rounded-full px-5 text-sm font-semibold transition-colors"
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

export default function DiscoverPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [sort, setSort] = useState<DiscoverSort>('new');

  const {
    songs,
    artistNames,
    quoteBySong,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    reset,
  } = useInfiniteSongs({ query: activeQuery, sort });

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setActiveQuery(searchQuery.trim());
  }, [searchQuery]);

  const handlePill = useCallback((next: DiscoverSort) => {
    setSearchQuery('');
    setActiveQuery('');
    setSort(next);
  }, []);

  const handleLoadRecent = useCallback(() => {
    setSearchQuery('');
    setActiveQuery('');
    setSort('new');
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <section className="mb-12">
          <h1 className="listen-h1 mb-8">Discover</h1>
          
          <form onSubmit={handleSearch} className="mb-6">
            <label className="relative block">
              <span className="sr-only">Search</span>
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2"
                style={{ color: 'var(--mute)' }}
                aria-hidden
              />
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
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
          </form>

          <div className="flex flex-wrap gap-2">
            <DiscoverPill label="Heat" active={sort === 'heat' && !activeQuery} onClick={() => handlePill('heat')} />
            <DiscoverPill label="New" active={sort === 'new' && !activeQuery} onClick={() => handlePill('new')} />
          </div>
        </section>

        {loading ? (
          <SongCardSkeletonGrid />
        ) : error ? (
          <div className="p-12 border-2 border-dashed border-border rounded-2xl text-center bg-muted/30">
            <p className="text-muted-foreground text-lg mb-4">
              {error.message || 'Failed to load songs'}
            </p>
            <button
              onClick={reset}
              className="px-6 py-2 bg-accent text-accent-foreground rounded-full hover:opacity-90 transition-opacity font-medium"
            >
              Try Again
            </button>
          </div>
        ) : songs.length === 0 ? (
          <div className="p-12 border-2 border-dashed border-border rounded-2xl text-center bg-muted/30">
            {activeQuery ? (
              <EmptyAction message="No songs found." label="Browse recent" onClick={handleLoadRecent} />
            ) : (
              <EmptyAction message="No songs found." href="/" label="Play" />
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
                  <SongCard
                    song={song}
                    artistName={artistNames.get(song.id)}
                    coin={quoteBySong.get(song.id) ?? null}
                  />
                </div>
              ))}
              
              {loadingMore && (
                <>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <SongCardSkeleton key={`skeleton-${i}`} />
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

            {!hasMore && songs.length > 0 && (
              <div className="py-12 text-center">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative">
                    <span className="px-4 bg-background text-sm text-muted-foreground">
                      You&apos;ve reached the end
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
