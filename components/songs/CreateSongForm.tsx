'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { getUserArtists } from '@/lib/services/artists';
import { createSong } from '@/lib/services/songs';
import { createGeneration } from '@/lib/services/generations';
import type { AIArtistDocument } from '@/types/firestore';

export function CreateSongForm() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [artists, setArtists] = useState<AIArtistDocument[]>([]);
  const [loadingArtists, setLoadingArtists] = useState(true);
  const [formData, setFormData] = useState({
    title: '',
    artistId: '',
    prompt: '',
    provider: 'stub', // Default to stub provider
  });

  useEffect(() => {
    if (user) {
      loadArtists();
    }
  }, [user]);

  const loadArtists = async () => {
    if (!user) return;
    try {
      const userArtists = await getUserArtists(user.uid);
      setArtists(userArtists);
      if (userArtists.length > 0) {
        setFormData(prev => ({ ...prev, artistId: userArtists[0].id }));
      }
    } catch (error) {
      console.error('Failed to load artists:', error);
      alert(`Failed to load artists: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoadingArtists(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (artists.length === 0) {
      alert('Please create an AI artist first');
      return;
    }

    setLoading(true);
    try {
      const selectedArtist = artists.find(a => a.id === formData.artistId);
      if (!selectedArtist) {
        throw new Error('Artist not found');
      }

      // Create song
      const song = await createSong(user.uid, {
        artistId: formData.artistId,
        artistVersionId: selectedArtist.currentVersionId,
        title: formData.title,
        isPublic: true,
      });

      // Get artist version for context
      const { getArtistVersion } = await import('@/lib/services/artists');
      const artistVersion = await getArtistVersion(selectedArtist.currentVersionId);
      if (!artistVersion) {
        throw new Error('Artist version not found');
      }

      // Create generation
      await createGeneration(song.currentVersionId, {
        prompt: {
          structured: {},
          freeText: formData.prompt,
        },
        parameters: {
          quality: 'medium',
        },
        provider: formData.provider,
        artistContext: {
          styleDNA: artistVersion.styleDNA,
          lore: artistVersion.lore,
        },
      });

      router.push(`/songs/${song.id}`);
    } catch (error) {
      console.error('Failed to create song:', error);
      alert('Failed to create song. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loadingArtists) {
    return <p>Loading your artists...</p>;
  }

  if (artists.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="mb-4">You need to create an AI artist first.</p>
        <a
          href="/create"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Create an artist
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="title" className="block text-sm font-medium mb-2">
          Song Title *
        </label>
        <input
          id="title"
          type="text"
          required
          value={formData.title}
          onChange={e => setFormData({ ...formData, title: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
        />
      </div>

      <div>
        <label htmlFor="artistId" className="block text-sm font-medium mb-2">
          AI Artist *
        </label>
        <select
          id="artistId"
          required
          value={formData.artistId}
          onChange={e => setFormData({ ...formData, artistId: e.target.value })}
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
        <label htmlFor="prompt" className="block text-sm font-medium mb-2">
          Generation Prompt *
        </label>
        <textarea
          id="prompt"
          required
          rows={4}
          value={formData.prompt}
          onChange={e => setFormData({ ...formData, prompt: e.target.value })}
          placeholder="Describe the song you want to generate..."
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
        />
      </div>

      <div>
        <label htmlFor="provider" className="block text-sm font-medium mb-2">
          AI Provider
        </label>
        <select
          id="provider"
          value={formData.provider}
          onChange={e => setFormData({ ...formData, provider: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
        >
          <option value="stub">Stub Provider (Development)</option>
          {/* More providers will be added here */}
        </select>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Generating...' : 'Generate Song'}
      </button>
    </form>
  );
}

