'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { createArtist } from '@/lib/services/artists';
import type { StyleDNA } from '@/types/firestore';

interface CreateArtistFormProps {
  onSuccess?: (artistId: string) => void;
}

export function CreateArtistForm({ onSuccess }: CreateArtistFormProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    lore: '',
    genres: '',
    moods: '',
    influences: '',
    tempoMin: '60',
    tempoMax: '180',
    isPublic: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const styleDNA: StyleDNA = {
        genres: formData.genres.split(',').map(g => g.trim()).filter(Boolean),
        moods: formData.moods.split(',').map(m => m.trim()).filter(Boolean),
        tempoRange: {
          min: parseInt(formData.tempoMin),
          max: parseInt(formData.tempoMax),
        },
        influences: formData.influences.split(',').map(i => i.trim()).filter(Boolean),
      };

      const artist = await createArtist(user.uid, {
        name: formData.name,
        styleDNA,
        lore: formData.lore,
        isPublic: formData.isPublic,
      });

      // If onSuccess callback provided, use it (for multi-step flow)
      // Otherwise, redirect to artist page (backward compatible)
      if (onSuccess) {
        onSuccess(artist.id);
      } else {
        router.push(`/artists/${artist.id}`);
      }
    } catch (error) {
      console.error('Failed to create artist:', error);
      alert('Failed to create artist. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-2 text-foreground">
          Artist Name *
        </label>
        <input
          id="name"
          type="text"
          required
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
        />
      </div>

      <div>
        <label htmlFor="lore" className="block text-sm font-medium mb-2 text-foreground">
          Bio / Lore *
        </label>
        <textarea
          id="lore"
          required
          rows={5}
          value={formData.lore}
          onChange={e => setFormData({ ...formData, lore: e.target.value })}
          className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all resize-none"
        />
      </div>

      <div>
        <label htmlFor="genres" className="block text-sm font-medium mb-2 text-foreground">
          Genres (comma-separated)
        </label>
        <input
          id="genres"
          type="text"
          value={formData.genres}
          onChange={e => setFormData({ ...formData, genres: e.target.value })}
          placeholder="jazz, electronic, cyberpunk"
          className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
        />
      </div>

      <div>
        <label htmlFor="moods" className="block text-sm font-medium mb-2 text-foreground">
          Moods (comma-separated)
        </label>
        <input
          id="moods"
          type="text"
          value={formData.moods}
          onChange={e => setFormData({ ...formData, moods: e.target.value })}
          placeholder="melancholic, energetic, dreamy"
          className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="tempoMin" className="block text-sm font-medium mb-2 text-foreground">
            Min Tempo (BPM)
          </label>
          <input
            id="tempoMin"
            type="number"
            min="30"
            max="200"
            value={formData.tempoMin}
            onChange={e => setFormData({ ...formData, tempoMin: e.target.value })}
            className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
          />
        </div>
        <div>
          <label htmlFor="tempoMax" className="block text-sm font-medium mb-2 text-foreground">
            Max Tempo (BPM)
          </label>
          <input
            id="tempoMax"
            type="number"
            min="30"
            max="200"
            value={formData.tempoMax}
            onChange={e => setFormData({ ...formData, tempoMax: e.target.value })}
            className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
          />
        </div>
      </div>

      <div>
        <label htmlFor="influences" className="block text-sm font-medium mb-2 text-foreground">
          Influences (comma-separated)
        </label>
        <input
          id="influences"
          type="text"
          value={formData.influences}
          onChange={e => setFormData({ ...formData, influences: e.target.value })}
          placeholder="Miles Davis, Daft Punk"
          className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <input
          id="isPublic"
          type="checkbox"
          checked={formData.isPublic}
          onChange={e => setFormData({ ...formData, isPublic: e.target.checked })}
          className="w-4 h-4 rounded border-border text-accent focus:ring-2 focus:ring-accent focus:ring-offset-0"
        />
        <label htmlFor="isPublic" className="text-sm text-foreground cursor-pointer">
          Make this artist public
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-3 bg-accent text-accent-foreground rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-soft"
      >
        {loading ? 'Creating...' : 'Create Artist'}
      </button>
    </form>
  );
}

