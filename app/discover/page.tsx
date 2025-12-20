'use client';

import { useState, useEffect } from 'react';
import { searchSongsByPrompt, getRecentSongs } from '@/lib/services/discovery';
import { SongCard } from '@/components/songs/SongCard';
import { Nav } from '@/components/navigation/Nav';
import type { SongDocument } from '@/types/firestore';

export default function DiscoverPage() {
  const [songs, setSongs] = useState<SongDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadRecentSongs();
  }, []);

  const loadRecentSongs = async () => {
    setLoading(true);
    try {
      const recent = await getRecentSongs(20);
      setSongs(recent);
    } catch (error) {
      console.error('Failed to load songs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      loadRecentSongs();
      return;
    }

    setLoading(true);
    try {
      const results = await searchSongsByPrompt(searchQuery, 20);
      setSongs(results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Nav />

      <main className="max-w-7xl mx-auto px-6 lg:px-8 py-8 lg:py-12">
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
              onClick={loadRecentSongs}
              className="px-4 py-2 rounded-full border border-border hover:bg-muted hover:border-accent/20 transition-all duration-200 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Recent
            </button>
            <button
              onClick={() => {
                setSearchQuery('cyberpunk');
                handleSearch({ preventDefault: () => {} } as React.FormEvent);
              }}
              className="px-4 py-2 rounded-full border border-border hover:bg-muted hover:border-accent/20 transition-all duration-200 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Cyberpunk
            </button>
            <button
              onClick={() => {
                setSearchQuery('jazz');
                handleSearch({ preventDefault: () => {} } as React.FormEvent);
              }}
              className="px-4 py-2 rounded-full border border-border hover:bg-muted hover:border-accent/20 transition-all duration-200 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Jazz
            </button>
          </div>
        </section>

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {songs.map(song => (
              <SongCard key={song.id} song={song} />
            ))}
          </div>
        )}

        {!loading && songs.length === 0 && (
          <div className="p-12 border-2 border-dashed border-border rounded-2xl text-center bg-muted/30">
            <p className="text-muted-foreground text-lg">
              No songs found. Try a different search or create your own!
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

