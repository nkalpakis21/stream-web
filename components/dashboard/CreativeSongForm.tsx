'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { SongCreatePreview, SongCustomizePanel } from '@/components/create/SongCustomizePanel';
import { useSongCustomize } from '@/components/create/useSongCustomize';
import { requestLyricsDraft } from '@/lib/create/lyricsDraftClient';
import { SONG_LYRICS_MAX, toWireCreateOptions } from '@/lib/create/songOptions';
import { getUserArtists } from '@/lib/services/artists';
import { abandonFailedSongCreate, createSong } from '@/lib/services/songs';
import { createGeneration } from '@/lib/services/generations';
import { runSongCreateAttempt, SongCreateFailed } from '@/lib/songs/songCreate';
import type { AIArtistDocument } from '@/types/firestore';
import { useToast, ToastContainer } from '@/components/ui/toast';

export function SongCreateFailureNotice({
  onRetry,
  disabled,
}: {
  onRetry: () => void;
  disabled: boolean;
}) {
  return (
    <div role="alert" className="rounded-xl border border-[#FF4D6A]/40 bg-card px-4 py-3">
      <p
        className="text-sm font-medium"
        style={{ color: '#FF4D6A', fontFamily: 'var(--font-figtree), system-ui, sans-serif' }}
      >
        Generation failed. Try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={disabled}
        className="mt-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-[#E8E6F2] px-4 text-sm font-medium text-[#0A0A10] disabled:opacity-50"
      >
        Retry
      </button>
    </div>
  );
}

interface CreativeSongFormProps {
  preselectedArtistId?: string;
  onSuccess?: (songId: string) => void;
  onCancel?: () => void;
}

export function CreativeSongForm({ preselectedArtistId, onSuccess, onCancel }: CreativeSongFormProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [generationFailed, setGenerationFailed] = useState(false);
  const submitLock = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const [artists, setArtists] = useState<AIArtistDocument[]>([]);
  const [loadingArtists, setLoadingArtists] = useState(true);
  const { toasts, showToast, dismissToast } = useToast();
  const [formData, setFormData] = useState({
    title: '',
    artistId: preselectedArtistId || '',
    prompt: '',
    provider: 'musicgpt',
  });
  const selectedForStyle = artists.find(artist => artist.id === formData.artistId) ?? null;
  const customize = useSongCustomize(
    selectedForStyle
      ? {
          id: selectedForStyle.id,
          name: selectedForStyle.name,
          moods: selectedForStyle.styleDNA?.moods ?? [],
          tempoMin: selectedForStyle.styleDNA?.tempoRange?.min,
          tempoMax: selectedForStyle.styleDNA?.tempoRange?.max,
        }
      : null
  );
  const requestDraft = useCallback(
    (input: { sessionId: string; prompt: string; artistId?: string | null }) =>
      requestLyricsDraft(input),
    []
  );

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

  const submitSong = async () => {
    if (submitLock.current) return;
    if (!user) return;

    if (artists.length === 0) {
      showToast('Create an artist first', 'error');
      return;
    }

    const selectedArtist = artists.find(a => a.id === formData.artistId);
    if (!selectedArtist || selectedArtist.ownerId !== user.uid) {
      showToast('Please select a valid artist', 'error');
      return;
    }

    if (formData.prompt.length > 300 || formData.prompt.trim().length === 0) {
      showToast('Please enter a valid prompt (max 300 characters)', 'error');
      return;
    }

    const chosen = customize.value;
    const customLyrics = chosen.instrumental || chosen.words !== 'mine' ? '' : chosen.lyrics.trim();
    if (customLyrics.length > SONG_LYRICS_MAX) {
      showToast('Lyrics cannot exceed 2000 characters', 'error');
      return;
    }

    setGenerationFailed(false);
    submitLock.current = true;
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    }
    const idempotencyKey = idempotencyKeyRef.current;
    setLoading(true);
    try {
      const created = await runSongCreateAttempt({
        createSong: async () => {
          const result = await createSong(user.uid, {
            artistId: formData.artistId,
            artistVersionId: selectedArtist.currentVersionId,
            title: formData.title,
            isPublic: true,
            idempotencyKey,
            prompt: formData.prompt,
            lyrics: customLyrics,
          });
          return { id: result.song.id, reused: result.reused };
        },
        createGeneration: async songId => {
          const { getArtistVersion } = await import('@/lib/services/artists');
          const artistVersion = await getArtistVersion(selectedArtist.currentVersionId);
          if (!artistVersion) {
            throw new Error('Artist version not found');
          }
          await createGeneration(songId, selectedArtist.currentVersionId, {
            prompt: {
              structured: {},
              freeText: formData.prompt,
            },
            parameters: {
              quality: 'medium',
            },
            provider: formData.provider,
            artistId: selectedArtist.id,
            artistContext: {
              styleDNA: artistVersion.styleDNA,
              lore: artistVersion.lore,
              vocalIdentity: artistVersion.vocalIdentity ?? selectedArtist.vocalIdentity ?? null,
            },
            lyrics: customLyrics || undefined,
            createOptions: toWireCreateOptions(chosen),
          });
        },
        abandon: songId =>
          abandonFailedSongCreate(songId, {
            prompt: formData.prompt,
            lyrics: customLyrics,
          }),
      });

      idempotencyKeyRef.current = null;
      setGenerationFailed(false);
      setFormData({
        title: '',
        artistId: artists[0]?.id || '',
        prompt: '',
        provider: 'musicgpt',
      });
      customize.reset();

      onSuccess?.(created.id);
      router.push(`/songs/${created.id}`);
    } catch (error) {
      console.error('Failed to create song:', error);
      const failedCreate = error instanceof SongCreateFailed ? error : null;
      if (!failedCreate || !failedCreate.keepIdempotencyKey) {
        idempotencyKeyRef.current = null;
      }
      if (failedCreate?.stage === 'generation') {
        setGenerationFailed(true);
      } else {
        showToast('Failed to create song. Please try again.', 'error');
      }
    } finally {
      submitLock.current = false;
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitSong();
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
      <div className="text-center py-12 rounded-xl border border-border bg-card">
        <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <p className="text-muted-foreground mb-4">Create an artist first, then generate a song.</p>
        <button
          type="button"
          onClick={() => router.push('/create')}
          className="text-primary hover:opacity-80 transition-opacity font-medium"
        >
          Create an artist →
        </button>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card via-card to-accent/5 shadow-lg">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
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
              <h3 className="text-xl font-bold text-foreground">Generate song</h3>
              <p className="text-sm text-muted-foreground">One generation. Then you listen.</p>
            </div>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
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
                Title *
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
                Artist *
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
                Prompt *
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
              placeholder="Mood, feel, what the song should do…"
              className={`w-full px-4 py-3 border rounded-xl bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all resize-none ${
                formData.prompt.length > 300
                  ? 'border-red-500 focus:ring-red-500'
                  : formData.prompt.length > 250
                  ? 'border-yellow-500 focus:ring-yellow-500'
                  : 'border-border'
              }`}
            />
          </div>

          <SongCustomizePanel
            key={customize.resetKey}
            artistName={selectedForStyle?.name}
            artistId={selectedForStyle?.id}
            defaults={customize.defaults}
            value={customize.value}
            onChange={customize.setValue}
            prompt={formData.prompt}
            requestDraft={requestDraft}
            disabled={loading}
          />

          {generationFailed ? (
            <SongCreateFailureNotice onRetry={() => { void submitSong(); }} disabled={loading} />
          ) : null}

          <SongCreatePreview
            artistName={selectedForStyle?.name}
            defaults={customize.defaults}
            value={customize.value}
            onReset={customize.reset}
          />

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              aria-busy={loading}
              disabled={loading || formData.prompt.length > 300 || formData.prompt.trim().length === 0 || customize.value.lyrics.length > SONG_LYRICS_MAX}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-accent-cta to-accent-cta/90 text-accent-ink rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-lg hover:shadow-xl"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Generating...
                </span>
              ) : (
                'Generate song'
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


