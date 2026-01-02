'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { getUserArtists } from '@/lib/services/artists';
import { createSong } from '@/lib/services/songs';
import { createGeneration } from '@/lib/services/generations';
import type { AIArtistDocument } from '@/types/firestore';

interface CreateSongFormProps {
  preselectedArtistId?: string;
  showSuccessMessage?: boolean;
}

export function CreateSongForm({ preselectedArtistId, showSuccessMessage }: CreateSongFormProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [artists, setArtists] = useState<AIArtistDocument[]>([]);
  const [loadingArtists, setLoadingArtists] = useState(true);
  const [formData, setFormData] = useState({
    title: '',
    artistId: preselectedArtistId || '',
    prompt: '',
    lyrics: '',
    provider: 'musicgpt', // Default to MusicGPT
  });

  const loadArtists = useCallback(async () => {
    if (!user) return;
    try {
      const userArtists = await getUserArtists(user.uid);
      setArtists(userArtists);
      if (userArtists.length > 0) {
        // Pre-select artist from URL param if provided, otherwise use first artist
        const artistToSelect = preselectedArtistId 
          ? userArtists.find(a => a.id === preselectedArtistId) || userArtists[0]
          : userArtists[0];
        setFormData(prev => ({ ...prev, artistId: artistToSelect.id }));
      }
    } catch (error) {
      console.error('Failed to load artists:', error);
      alert(`Failed to load artists: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoadingArtists(false);
    }
  }, [user, preselectedArtistId]);

  useEffect(() => {
    if (user) {
      loadArtists();
    }
  }, [user, loadArtists]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (artists.length === 0) {
      alert('Please create an AI artist first');
      return;
    }

    // Validate that the selected artist belongs to the user
    const selectedArtist = artists.find(a => a.id === formData.artistId);
    if (!selectedArtist) {
      alert('Please select a valid artist that belongs to you');
      return;
    }

    // Double-check ownership (client-side validation)
    if (selectedArtist.ownerId !== user.uid) {
      alert('You can only create songs for your own artists');
      return;
    }

    // Validate prompt length
    if (formData.prompt.length > 300) {
      alert('Prompt cannot exceed 300 characters. Please shorten your description.');
      return;
    }

    if (formData.prompt.trim().length === 0) {
      alert('Please enter a generation prompt.');
      return;
    }

    // Validate lyrics length
    if (formData.lyrics.length > 2000) {
      alert('Lyrics cannot exceed 2000 characters. Please shorten your lyrics.');
      return;
    }

    setLoading(true);
    try {

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
        lyrics: formData.lyrics.trim() || undefined,
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
        <button
          type="button"
          onClick={() => router.push('/create?step=artist')}
          className="text-accent hover:opacity-80 transition-opacity font-medium"
        >
          Create an artist →
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {showSuccessMessage && (
        <div className="mb-6 p-4 bg-accent/10 border border-accent/20 rounded-xl">
          <p className="text-sm text-foreground">
            <span className="font-semibold">✓ Artist created!</span> Now create your first song with your new AI artist.
          </p>
        </div>
      )}
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
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="prompt" className="block text-sm font-medium text-foreground">
            Generation Prompt *
          </label>
          <span
            className={`text-xs font-medium transition-colors ${
              formData.prompt.length > 300
                ? 'text-red-500'
                : formData.prompt.length > 250
                ? 'text-yellow-500'
                : 'text-muted-foreground'
            }`}
          >
            {formData.prompt.length} / 300
          </span>
        </div>
        <textarea
          id="prompt"
          required
          rows={5}
          maxLength={300}
          value={formData.prompt}
          onChange={e => {
            const value = e.target.value;
            if (value.length <= 300) {
              setFormData({ ...formData, prompt: value });
            }
          }}
          placeholder="Enter your song generation prompt..."
          className={`w-full px-4 py-3 border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all resize-none ${
            formData.prompt.length > 300
              ? 'border-red-500 focus:ring-red-500'
              : formData.prompt.length > 250
              ? 'border-yellow-500 focus:ring-yellow-500'
              : 'border-border'
          }`}
        />
        {formData.prompt.length > 300 && (
          <p className="mt-1.5 text-xs text-red-500">
            Prompt cannot exceed 300 characters. Please shorten your description.
          </p>
        )}
        {formData.prompt.length > 250 && formData.prompt.length <= 300 && (
          <p className="mt-1.5 text-xs text-yellow-500">
            You&apos;re approaching the character limit.
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="lyrics" className="block text-sm font-medium text-foreground">
            Lyrics (Optional)
          </label>
          <span
            className={`text-xs font-medium transition-colors ${
              formData.lyrics.length > 2000
                ? 'text-red-500'
                : formData.lyrics.length > 1800
                ? 'text-yellow-500'
                : 'text-muted-foreground'
            }`}
          >
            {formData.lyrics.length} / 2000
          </span>
        </div>
        <textarea
          id="lyrics"
          rows={12}
          maxLength={2000}
          value={formData.lyrics}
          onChange={e => {
            const value = e.target.value;
            if (value.length <= 2000) {
              setFormData({ ...formData, lyrics: value });
            }
          }}
          placeholder="Enter your song lyrics..."
          className={`w-full px-4 py-3 border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all resize-none ${
            formData.lyrics.length > 2000
              ? 'border-red-500 focus:ring-red-500'
              : formData.lyrics.length > 1800
              ? 'border-yellow-500 focus:ring-yellow-500'
              : 'border-border'
          }`}
        />
        {formData.lyrics.length > 2000 && (
          <p className="mt-1.5 text-xs text-red-500">
            Lyrics cannot exceed 2000 characters. Please shorten your lyrics.
          </p>
        )}
        {formData.lyrics.length > 1800 && formData.lyrics.length <= 2000 && (
          <p className="mt-1.5 text-xs text-yellow-500">
            You&apos;re approaching the character limit.
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || formData.prompt.length > 300 || formData.prompt.trim().length === 0 || formData.lyrics.length > 2000}
        className="w-full px-6 py-3 bg-accent text-accent-foreground rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-soft"
      >
        {loading ? 'Generating...' : 'Generate Song'}
      </button>
    </form>
  );
}

