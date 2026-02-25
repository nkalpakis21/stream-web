'use client';

import { useState, useCallback } from 'react';
import { SongCard } from '@/components/songs/SongCard';
import { V0Navbar } from '@/components/navigation/V0Navbar';
import { InfiniteScrollSentinel } from '@/components/discover/InfiniteScrollSentinel';
import { SongCardSkeleton } from '@/components/discover/SongCardSkeleton';
import { useInfiniteSongs } from '@/hooks/useInfiniteSongs';

export default function DiscoverPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');

  const {
    songs,
    artistNames,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    reset,
  } = useInfiniteSongs({ query: activeQuery });

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmedQuery = searchQuery.trim();
    setActiveQuery(trimmedQuery);
    reset(); // Reset will trigger new load with updated query
  }, [searchQuery, reset]);

  const handleQuickFilter = useCallback((query: string) => {
    setSearchQuery(query);
    setActiveQuery(query);
    reset();
  }, [reset]);

  const handleLoadRecent = useCallback(() => {
    setSearchQuery('');
    setActiveQuery('');
    reset();
  }, [reset]);

  return (
    <div className="min-h-screen bg-background">
      <V0Navbar />

      <main className="max-w-7xl mx-auto px-6 lg:px-8 pt-20 pb-8 lg:pt-24 lg:pb-12">
        <section className="mb-12">
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-8">Discover Music</h1>
          
          <form onSubmit={handleSearch} className="mb-6">
            <div className="flex gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by prompt, genre, mood, or description..."
                className="flex-1 px-5 py-3 border border-border rounded-full bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
              />
              <button
                type="submit"
                className="px-6 py-3 bg-accent text-accent-foreground rounded-full hover:opacity-90 transition-opacity font-medium shadow-soft"
              >
                Search
              </button>
            </div>
          </form>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleLoadRecent}
              className="px-4 py-2 rounded-full border border-border hover:bg-muted hover:border-accent/20 transition-all duration-200 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Recent
            </button>
            <button
              onClick={() => handleQuickFilter('cyberpunk')}
              className="px-4 py-2 rounded-full border border-border hover:bg-muted hover:border-accent/20 transition-all duration-200 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Cyberpunk
            </button>
            <button
              onClick={() => handleQuickFilter('jazz')}
              className="px-4 py-2 rounded-full border border-border hover:bg-muted hover:border-accent/20 transition-all duration-200 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Jazz
            </button>
          </div>
        </section>

        {/* Initial Loading State */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <SongCardSkeleton key={i} />
            ))}
          </div>
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
            <p className="text-muted-foreground text-lg">
              No songs found. Try a different search or create your own!
            </p>
          </div>
        ) : (
          <>
            {/* Songs Grid */}
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
                  />
                </div>
              ))}
              
              {/* Loading More Skeletons */}
              {loadingMore && (
                <>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <SongCardSkeleton key={`skeleton-${i}`} />
                  ))}
                </>
              )}
            </div>

            {/* Infinite Scroll Sentinel */}
            {hasMore && !loadingMore && (
              <InfiniteScrollSentinel
                onIntersect={loadMore}
                enabled={!loading && !loadingMore}
              />
            )}

            {/* Loading More Indicator */}
            {loadingMore && (
              <div className="py-8 text-center">
                <div className="inline-flex items-center gap-3 text-muted-foreground">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-medium">Loading more songs...</span>
                </div>
              </div>
            )}

            {/* End of Results */}
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

