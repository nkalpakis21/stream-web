'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CoverMedia } from '@/components/media/CoverMedia';
import { useAuth } from '@/components/providers/AuthProvider';
import { getFreshIdToken } from '@/lib/api/clientAuth';
import { getArtist, getArtistVersion } from '@/lib/services/artists';
import { GenerationStillRunning, createGeneration } from '@/lib/services/generations';
import type { CoverFields } from '@/lib/covers/resolve';
import type { OwnerSongTileState } from '@/lib/songs/ownerTile';
import './audio-unavailable.css';

export type OwnerAudioTileState = 'unavailable' | OwnerSongTileState;

interface UnavailableAudioRowViewProps {
  title: string;
  cover: CoverFields;
  state?: OwnerAudioTileState;
  confirming: boolean;
  busy: boolean;
  retrying?: boolean;
  error: string | null;
  note?: string | null;
  onAskDelete: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onRetry?: () => void;
}

/** Greyed owner tile. Cover and title are not links and not a play control. */
export function UnavailableAudioRowView({
  title,
  cover,
  confirming,
  busy,
  error,
  note = null,
  onAskDelete,
  onCancel,
  onConfirm,
  onRetry,
  state = 'unavailable',
  retrying = false,
}: UnavailableAudioRowViewProps) {
  const status =
    state === 'generating'
      ? 'Generating…'
      : state === 'failed'
        ? 'Generation failed'
        : 'Audio unavailable';
  const aria =
    state === 'generating'
      ? `${title}, generating`
      : state === 'failed'
        ? `${title}, generation failed`
        : `${title}, audio unavailable`;
  return (
    <article className="audio-unavailable block min-w-0 rounded-[12px] bg-card" aria-label={aria}>
      <div
        className={`audio-unavailable-cover relative aspect-square overflow-hidden rounded-cover${
          state === 'generating' ? ' is-generating' : ''
        }`}
      >
        <CoverMedia
          cover={cover}
          title={title}
          playback="still"
          sizes="(max-width: 768px) 50vw, 25vw"
        />
      </div>
      <div className="p-3">
        <h3 className="audio-unavailable-title" data-entity="track">
          {title}
        </h3>
        <p className={state === 'failed' ? 'audio-unavailable-meta is-failed' : 'audio-unavailable-meta'}>
          {status}
        </p>
        {state === 'generating' ? null : (
          <div className="audio-unavailable-actions">
            {state === 'failed' && onRetry ? (
              <button
                type="button"
                className="audio-unavailable-retry"
                onClick={onRetry}
                disabled={retrying || busy}
              >
                {retrying ? 'Retrying…' : 'Retry'}
              </button>
            ) : null}
            <button
              type="button"
              className="audio-unavailable-delete"
              aria-label={`Delete ${title}`}
              onClick={onAskDelete}
              disabled={busy}
            >
              Delete
            </button>
          </div>
        )}
        {note && !confirming ? <p className="audio-unavailable-note">{note}</p> : null}
        {error && !confirming ? (
          <p className="audio-unavailable-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {confirming ? (
        <div className="audio-unavailable-sheet-backdrop">
          <button
            type="button"
            aria-label="Cancel"
            className="absolute inset-0"
            onClick={onCancel}
            disabled={busy}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-song-title"
            className="audio-unavailable-sheet"
          >
            <h2 id="delete-song-title">Delete song?</h2>
            {error ? (
              <p className="audio-unavailable-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="audio-unavailable-sheet-actions">
              <button
                type="button"
                className="audio-unavailable-cancel"
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="audio-unavailable-confirm"
                onClick={onConfirm}
                disabled={busy}
              >
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

interface UnavailableAudioRowProps {
  songId: string;
  title: string;
  cover: CoverFields;
  state?: OwnerAudioTileState;
  prompt?: string | null;
  lyrics?: string | null;
  artistId?: string;
  artistVersionId?: string;
}

/**
 * Owner artist page only. Delete reuses DELETE /api/songs/[id].
 * The row stays in place until that delete succeeds.
 */
export function UnavailableAudioRow({
  songId,
  title,
  cover,
  state = 'unavailable',
  prompt,
  lyrics,
  artistId,
  artistVersionId,
}: UnavailableAudioRowProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [phase, setPhase] = useState(state);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    setPhase(state);
  }, [state]);

  useEffect(() => {
    if (!confirming) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        setConfirming(false);
        setError(null);
      }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [confirming, busy]);

  if (gone) return null;

  const confirmDelete = async () => {
    if (!user) {
      setError('Sign in to delete this song.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getFreshIdToken(user);
      const response = await fetch(`/api/songs/${songId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: user.uid }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' && data.error.trim()
            ? data.error
            : 'Failed to delete song'
        );
      }
      setGone(true);
      setConfirming(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete song');
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    const freeText = typeof prompt === 'string' ? prompt.trim() : '';
    if (!freeText || !artistId || !artistVersionId) {
      setError('Generation failed. Try again.');
      return;
    }
    setRetrying(true);
    setError(null);
    setNote(null);
    try {
      const [artistVersion, artist] = await Promise.all([
        getArtistVersion(artistVersionId),
        getArtist(artistId),
      ]);
      if (!artistVersion) {
        throw new Error('Artist version not found');
      }
      await createGeneration(songId, artistVersionId, {
        prompt: { structured: {}, freeText },
        parameters: { quality: 'medium' },
        provider: 'musicgpt',
        artistId,
        artistContext: {
          styleDNA: artistVersion.styleDNA,
          lore: artistVersion.lore,
          vocalIdentity: artistVersion.vocalIdentity ?? artist?.vocalIdentity ?? null,
        },
        lyrics: typeof lyrics === 'string' && lyrics.trim() ? lyrics.trim() : undefined,
      });
      setPhase('generating');
      router.refresh();
    } catch (err) {
      if (err instanceof GenerationStillRunning) {
        setNote('Still working on it. Check back soon.');
        return;
      }
      setError('Generation failed. Try again.');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <UnavailableAudioRowView
      title={title}
      cover={cover}
      state={phase}
      confirming={confirming}
      busy={busy}
      retrying={retrying}
      error={error}
      note={note}
      onAskDelete={() => setConfirming(true)}
      onCancel={() => {
        if (busy) return;
        setConfirming(false);
        setError(null);
      }}
      onConfirm={() => {
        void confirmDelete();
      }}
      onRetry={phase === 'failed' ? () => { void retry(); } : undefined}
    />
  );
}
