'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CoverMedia } from '@/components/media/CoverMedia';
import { useAuth } from '@/components/providers/AuthProvider';
import { getFreshIdToken } from '@/lib/api/clientAuth';
import type { CoverFields } from '@/lib/covers/resolve';
import './audio-unavailable.css';

interface UnavailableAudioRowViewProps {
  title: string;
  cover: CoverFields;
  confirming: boolean;
  busy: boolean;
  error: string | null;
  onAskDelete: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Greyed owner tile. Cover and title are not links and not a play control. */
export function UnavailableAudioRowView({
  title,
  cover,
  confirming,
  busy,
  error,
  onAskDelete,
  onCancel,
  onConfirm,
}: UnavailableAudioRowViewProps) {
  return (
    <article className="audio-unavailable block min-w-0 rounded-[12px] bg-card" aria-label={`${title}, audio unavailable`}>
      <div className="audio-unavailable-cover relative aspect-square overflow-hidden rounded-cover">
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
        <p className="audio-unavailable-meta">Audio unavailable</p>
        <button
          type="button"
          className="audio-unavailable-delete"
          aria-label={`Delete ${title}`}
          onClick={onAskDelete}
        >
          Delete
        </button>
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
}

/**
 * Owner artist page only. Delete reuses DELETE /api/songs/[id].
 * The row stays in place until that delete succeeds.
 */
export function UnavailableAudioRow({ songId, title, cover }: UnavailableAudioRowProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

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

  return (
    <UnavailableAudioRowView
      title={title}
      cover={cover}
      confirming={confirming}
      busy={busy}
      error={error}
      onAskDelete={() => setConfirming(true)}
      onCancel={() => {
        if (busy) return;
        setConfirming(false);
        setError(null);
      }}
      onConfirm={() => {
        void confirmDelete();
      }}
    />
  );
}
