'use client';

import { useState, useEffect } from 'react';
import { searchSongsByPrompt, getRecentSongs } from '@/lib/services/discovery';
import { SongCard } from '@/components/songs/SongCard';
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
    <div className="min-h-screen">
      <nav className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <a href="/" className="text-2xl font-bold">
              Stream
            </a>
            <div className="flex gap-4 items-center">
              <a href="/discover">Discover</a>
              <a href="/artists">Artists</a>
              <a href="/create">Create</a>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <section className="mb-8">
          <h1 className="text-3xl font-bold mb-6">Discover Music</h1>
          
          <form onSubmit={handleSearch} className="mb-6">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by prompt, genre, mood, or description..."
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              />
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Search
              </button>
            </div>
          </form>

          <div className="flex gap-2 mb-6">
            <button
              onClick={loadRecentSongs}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Recent
            </button>
            <button
              onClick={() => {
                setSearchQuery('cyberpunk');
                handleSearch({ preventDefault: () => {} } as React.FormEvent);
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Cyberpunk
            </button>
            <button
              onClick={() => {
                setSearchQuery('jazz');
                handleSearch({ preventDefault: () => {} } as React.FormEvent);
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Jazz
            </button>
          </div>
        </section>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {songs.map(song => (
              <SongCard key={song.id} song={song} />
            ))}
          </div>
        )}

        {!loading && songs.length === 0 && (
          <p className="text-gray-500 text-center py-12">
            No songs found. Try a different search or create your own!
          </p>
        )}
      </main>
    </div>
  );
}

