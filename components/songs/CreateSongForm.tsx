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
      const artistVersion = await getArtistVersion(
        selectedArtist.currentVersionId
      );
      if (!artistVersion) {
        throw new Error('Artist version not found');
      }

      // Create generation record for this song.
      // For MusicGPT-style providers this will be fulfilled asynchronously
      // via webhook; for the stub provider we still generate synchronously.
      await createGeneration(song.id, selectedArtist.currentVersionId, {
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
    return (
      <div className="py-12 text-center">
        <div className="inline-block w-6 h-6 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (artists.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">You need to create an AI artist first.</p>
        <a
          href="/create"
          className="text-accent hover:opacity-80 transition-opacity font-medium"
        >
          Create an artist →
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="title" className="block text-sm font-medium mb-2 text-foreground">
          Song Title *
        </label>
        <input
          id="title"
          type="text"
          required
          value={formData.title}
          onChange={e => setFormData({ ...formData, title: e.target.value })}
          className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
        />
      </div>

      <div>
        <label htmlFor="artistId" className="block text-sm font-medium mb-2 text-foreground">
          AI Artist *
        </label>
        <select
          id="artistId"
          required
          value={formData.artistId}
          onChange={e => setFormData({ ...formData, artistId: e.target.value })}
          className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
        >
          {artists.map(artist => (
            <option key={artist.id} value={artist.id}>
              {artist.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="prompt" className="block text-sm font-medium mb-2 text-foreground">
          Generation Prompt *
        </label>
        <textarea
          id="prompt"
          required
          rows={5}
          value={formData.prompt}
          onChange={e => setFormData({ ...formData, prompt: e.target.value })}
          placeholder="Describe the song you want to generate..."
          className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all resize-none"
        />
      </div>

      <div>
        <label htmlFor="provider" className="block text-sm font-medium mb-2 text-foreground">
          AI Provider
        </label>
        <select
          id="provider"
          value={formData.provider}
          onChange={e => setFormData({ ...formData, provider: e.target.value })}
          className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
        >
          <option value="stub">Stub Provider (Development)</option>
          <option value="musicgpt">MusicGPT (Production)</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-3 bg-accent text-accent-foreground rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-soft"
      >
        {loading ? 'Generating...' : 'Generate Song'}
      </button>
    </form>
  );
}

