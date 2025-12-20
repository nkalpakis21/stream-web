'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { getSong } from '@/lib/services/songs';
import { getUserArtists } from '@/lib/services/artists';
import { forkSong } from '@/lib/services/songs';
import { createCollaboration } from '@/lib/services/collaborations';
import type { AIArtistDocument } from '@/types/firestore';

export default function ForkSongPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const songId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [artists, setArtists] = useState<AIArtistDocument[]>([]);
  const [selectedArtistId, setSelectedArtistId] = useState('');
  const [newTitle, setNewTitle] = useState('');

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [song, userArtists] = await Promise.all([
        getSong(songId),
        getUserArtists(user.uid),
      ]);

      if (!song) {
        alert('Song not found');
        router.push('/');
        return;
      }

      if (userArtists.length === 0) {
        alert('You need to create an AI artist first');
        router.push('/create');
        return;
      }

      setArtists(userArtists);
      setSelectedArtistId(userArtists[0].id);
      setNewTitle(`${song.title} (Fork)`);
    } catch (error) {
      console.error('Failed to load data:', error);
      alert('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user, songId, router]);

  useEffect(() => {
    if (user && !authLoading) {
      loadData();
    } else if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, loadData, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedArtistId) return;

    setSubmitting(true);
    try {
      const selectedArtist = artists.find(a => a.id === selectedArtistId);
      if (!selectedArtist) {
        throw new Error('Artist not found');
      }

      const newSong = await forkSong(
        songId,
        user.uid,
        selectedArtistId,
        selectedArtist.currentVersionId,
        newTitle || undefined
      );

      // Create collaboration record
      await createCollaboration({
        type: 'fork',
        sourceSongId: songId,
        targetSongId: newSong.id,
        collaboratorId: user.uid,
      });

      router.push(`/songs/${newSong.id}`);
    } catch (error) {
      console.error('Failed to fork song:', error);
      alert('Failed to fork song. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <nav className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <a href="/" className="text-2xl font-bold">
              Stream ⭐
            </a>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold mb-6">Fork Song</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="artistId" className="block text-sm font-medium mb-2">
              Select Your AI Artist *
            </label>
            <select
              id="artistId"
              required
              value={selectedArtistId}
              onChange={e => setSelectedArtistId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
            >
              {artists.map(artist => (
                <option key={artist.id} value={artist.id}>
                  {artist.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-2">
              New Title
            </label>
            <input
              id="title"
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Forking...' : 'Fork Song'}
          </button>
        </form>
      </main>
    </div>
  );
}

