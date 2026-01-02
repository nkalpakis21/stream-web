'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { getUserArtists } from '@/lib/services/artists';
import { createSong } from '@/lib/services/songs';
import { createGeneration } from '@/lib/services/generations';
import type { AIArtistDocument } from '@/types/firestore';

interface CreativeSongFormProps {
  preselectedArtistId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function CreativeSongForm({ preselectedArtistId, onSuccess, onCancel }: CreativeSongFormProps) {
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
    provider: 'musicgpt',
  });

  const loadArtists = useCallback(async () => {
    if (!user) return;
    try {
      const userArtists = await getUserArtists(user.uid);
      setArtists(userArtists);
      if (userArtists.length > 0) {
        const artistToSelect = preselectedArtistId 
          ? userArtists.find(a => a.id === preselectedArtistId) || userArtists[0]
          : userArtists[0];
        setFormData(prev => ({ ...prev, artistId: artistToSelect.id }));
      }
    } catch (error) {
      console.error('Failed to load artists:', error);
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

    const selectedArtist = artists.find(a => a.id === formData.artistId);
    if (!selectedArtist || selectedArtist.ownerId !== user.uid) {
      alert('Please select a valid artist');
      return;
    }

    if (formData.prompt.length > 300 || formData.prompt.trim().length === 0) {
      alert('Please enter a valid prompt (max 300 characters)');
      return;
    }

    if (formData.lyrics.length > 2000) {
      alert('Lyrics cannot exceed 2000 characters');
      return;
    }

    setLoading(true);
    try {
      const song = await createSong(user.uid, {
        artistId: formData.artistId,
        artistVersionId: selectedArtist.currentVersionId,
        title: formData.title,
        isPublic: true,
      });

      const { getArtistVersion } = await import('@/lib/services/artists');
      const artistVersion = await getArtistVersion(selectedArtist.currentVersionId);
      if (!artistVersion) {
        throw new Error('Artist version not found');
      }

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

      // Reset form
      setFormData({
        title: '',
        artistId: artists[0]?.id || '',
        prompt: '',
        lyrics: '',
        provider: 'musicgpt',
      });

      if (onSuccess) {
        onSuccess();
      } else {
        router.push(`/songs/${song.id}`);
      }
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
      <div className="text-center py-12 rounded-2xl border border-border bg-card">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <p className="text-muted-foreground mb-4">You need to create an AI artist first.</p>
        <button
          type="button"
          onClick={() => router.push('/dashboard?tab=artists')}
          className="text-accent hover:opacity-80 transition-opacity font-medium"
        >
          Create an artist →
        </button>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-accent/5 shadow-lg">
      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">Create New Song</h3>
              <p className="text-sm text-muted-foreground">Generate music with your AI artist</p>
            </div>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                placeholder="e.g., Midnight Dreams"
                className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
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
                className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 backdrop-blur-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
              >
                {artists.map(artist => (
                  <option key={artist.id} value={artist.id}>
                    {artist.name}
                  </option>
                ))}
              </select>
            </div>
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
              rows={4}
              maxLength={300}
              value={formData.prompt}
              onChange={e => {
                const value = e.target.value;
                if (value.length <= 300) {
                  setFormData({ ...formData, prompt: value });
                }
              }}
              placeholder="Describe the style, mood, and feel of your song..."
              className={`w-full px-4 py-3 border rounded-xl bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all resize-none ${
                formData.prompt.length > 300
                  ? 'border-red-500 focus:ring-red-500'
                  : formData.prompt.length > 250
                  ? 'border-yellow-500 focus:ring-yellow-500'
                  : 'border-border'
              }`}
            />
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
              rows={6}
              maxLength={2000}
              value={formData.lyrics}
              onChange={e => {
                const value = e.target.value;
                if (value.length <= 2000) {
                  setFormData({ ...formData, lyrics: value });
                }
              }}
              placeholder="Enter your song lyrics (optional)..."
              className={`w-full px-4 py-3 border rounded-xl bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all resize-none ${
                formData.lyrics.length > 2000
                  ? 'border-red-500 focus:ring-red-500'
                  : formData.lyrics.length > 1800
                  ? 'border-yellow-500 focus:ring-yellow-500'
                  : 'border-border'
              }`}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || formData.prompt.length > 300 || formData.prompt.trim().length === 0 || formData.lyrics.length > 2000}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-accent to-accent/90 text-accent-foreground rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-lg hover:shadow-xl"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Generating...
                </span>
              ) : (
                'Generate Song'
              )}
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-6 py-3 border border-border rounded-xl hover:bg-muted/50 transition-all font-medium text-foreground"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

