'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { createArtist } from '@/lib/services/artists';
import type { StyleDNA } from '@/types/firestore';

export function CreateArtistForm() {
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

      router.push(`/artists/${artist.id}`);
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
        <label htmlFor="name" className="block text-sm font-medium mb-2">
          Artist Name *
        </label>
        <input
          id="name"
          type="text"
          required
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
        />
      </div>

      <div>
        <label htmlFor="lore" className="block text-sm font-medium mb-2">
          Bio / Lore *
        </label>
        <textarea
          id="lore"
          required
          rows={4}
          value={formData.lore}
          onChange={e => setFormData({ ...formData, lore: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
        />
      </div>

      <div>
        <label htmlFor="genres" className="block text-sm font-medium mb-2">
          Genres (comma-separated)
        </label>
        <input
          id="genres"
          type="text"
          value={formData.genres}
          onChange={e => setFormData({ ...formData, genres: e.target.value })}
          placeholder="jazz, electronic, cyberpunk"
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
        />
      </div>

      <div>
        <label htmlFor="moods" className="block text-sm font-medium mb-2">
          Moods (comma-separated)
        </label>
        <input
          id="moods"
          type="text"
          value={formData.moods}
          onChange={e => setFormData({ ...formData, moods: e.target.value })}
          placeholder="melancholic, energetic, dreamy"
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="tempoMin" className="block text-sm font-medium mb-2">
            Min Tempo (BPM)
          </label>
          <input
            id="tempoMin"
            type="number"
            min="30"
            max="200"
            value={formData.tempoMin}
            onChange={e => setFormData({ ...formData, tempoMin: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
          />
        </div>
        <div>
          <label htmlFor="tempoMax" className="block text-sm font-medium mb-2">
            Max Tempo (BPM)
          </label>
          <input
            id="tempoMax"
            type="number"
            min="30"
            max="200"
            value={formData.tempoMax}
            onChange={e => setFormData({ ...formData, tempoMax: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
          />
        </div>
      </div>

      <div>
        <label htmlFor="influences" className="block text-sm font-medium mb-2">
          Influences (comma-separated)
        </label>
        <input
          id="influences"
          type="text"
          value={formData.influences}
          onChange={e => setFormData({ ...formData, influences: e.target.value })}
          placeholder="Miles Davis, Daft Punk"
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
        />
      </div>

      <div className="flex items-center">
        <input
          id="isPublic"
          type="checkbox"
          checked={formData.isPublic}
          onChange={e => setFormData({ ...formData, isPublic: e.target.checked })}
          className="mr-2"
        />
        <label htmlFor="isPublic" className="text-sm">
          Make this artist public
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Creating...' : 'Create Artist'}
      </button>
    </form>
  );
}

