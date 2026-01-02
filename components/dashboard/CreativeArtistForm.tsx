'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { createArtist } from '@/lib/services/artists';
import type { StyleDNA } from '@/types/firestore';

interface CreativeArtistFormProps {
  onSuccess?: (artistId: string) => void;
  onCancel?: () => void;
}

export function CreativeArtistForm({ onSuccess, onCancel }: CreativeArtistFormProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
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

      // Reset form
      setFormData({
        name: '',
        lore: '',
        genres: '',
        moods: '',
        influences: '',
        tempoMin: '60',
        tempoMax: '180',
        isPublic: true,
      });

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
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-accent/5 shadow-lg">
      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">Create New Artist</h3>
              <p className="text-sm text-muted-foreground">Bring your AI artist to life</p>
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

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Required Fields Section */}
          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Required</span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            </div>

            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-2 text-foreground">
                Artist Name <span className="text-accent">*</span>
              </label>
              <input
                id="name"
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Neon Dreams"
                className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label htmlFor="lore" className="block text-sm font-medium mb-2 text-foreground">
                Bio / Lore <span className="text-accent">*</span>
              </label>
              <textarea
                id="lore"
                required
                rows={4}
                value={formData.lore}
                onChange={e => setFormData({ ...formData, lore: e.target.value })}
                placeholder="Describe your artist's background, style, and personality..."
                className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all resize-none"
              />
            </div>
          </div>

          {/* Optional Fields - Collapsible Section */}
          <div className="border-t border-border/50 pt-6">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-all duration-200 group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 group-hover:bg-accent/20 flex items-center justify-center transition-colors">
                  <svg
                    className={`w-5 h-5 text-accent transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                <div className="text-left">
                  <h4 className="text-sm font-semibold text-foreground">Additional Details</h4>
                  <p className="text-xs text-muted-foreground">Genres, moods, tempo, and more (optional)</p>
                </div>
              </div>
              <span className="text-xs font-medium text-muted-foreground px-2 py-1 rounded-full bg-background/50">
                Optional
              </span>
            </button>

            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                showAdvanced ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="pt-5 space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="genres" className="block text-sm font-medium mb-2 text-foreground">
                          Genres
                        </label>
                        <input
                          id="genres"
                          type="text"
                          value={formData.genres}
                          onChange={e => setFormData({ ...formData, genres: e.target.value })}
                          placeholder="jazz, electronic, cyberpunk"
                          className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                        />
                      </div>

                      <div>
                        <label htmlFor="moods" className="block text-sm font-medium mb-2 text-foreground">
                          Moods
                        </label>
                        <input
                          id="moods"
                          type="text"
                          value={formData.moods}
                          onChange={e => setFormData({ ...formData, moods: e.target.value })}
                          placeholder="melancholic, energetic, dreamy"
                          className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="influences" className="block text-sm font-medium mb-2 text-foreground">
                        Influences
                      </label>
                      <input
                        id="influences"
                        type="text"
                        value={formData.influences}
                        onChange={e => setFormData({ ...formData, influences: e.target.value })}
                        placeholder="Miles Davis, Daft Punk"
                        className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
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
                          className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 backdrop-blur-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
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
                          className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 backdrop-blur-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2 pb-2">
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
                  </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-accent to-accent/90 text-accent-foreground rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-lg hover:shadow-xl"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Creating...
                </span>
              ) : (
                'Create Artist'
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

