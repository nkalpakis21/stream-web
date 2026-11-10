'use client';

import { useEffect, useId, useState } from 'react';
import { SongCustomizePanel } from '@/components/create/SongCustomizePanel';
import { ADD_VOCALS_LABEL } from '@/lib/songs/beatFirst';
import {
  artistDefaults,
  initialSongCustomize,
  type ArtistDefaults,
  type LyricsDraftResult,
  type SongCustomizeValue,
} from '@/lib/create/songOptions';
import './pick-your-take.css';

export function AddVocalsSheet({
  artistName,
  artistId,
  defaults,
  prompt,
  requestDraft,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  artistName?: string | null;
  artistId?: string | null;
  defaults: ArtistDefaults;
  prompt: string;
  requestDraft?: (input: { sessionId: string; prompt: string; artistId?: string | null }) => Promise<LyricsDraftResult>;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (value: SongCustomizeValue) => void;
}) {
  const titleId = useId();
  const [value, setValue] = useState<SongCustomizeValue>(() => initialSongCustomize(defaults));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="take-sheet">
      <button type="button" className="take-sheet-backdrop" aria-label="Dismiss" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="take-sheet-panel">
        <button type="button" className="take-sheet-close" aria-label="Close" onClick={onClose}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
            <path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <h2 id={titleId} className="take-title">
          {ADD_VOCALS_LABEL}
        </h2>
        <div className="mt-4">
          <SongCustomizePanel
            artistName={artistName}
            artistId={artistId}
            defaults={defaults}
            value={value}
            onChange={setValue}
            prompt={prompt}
            requestDraft={requestDraft}
            disabled={busy}
            part="voice-words"
          />
        </div>
        {error ? (
          <p className="take-error mt-3" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[12px] bg-[#E8E6F2] px-4 text-sm font-semibold text-[#0A0A10] disabled:opacity-40"
          disabled={busy}
          onClick={() => onSubmit(value)}
        >
          {busy ? 'Adding vocals…' : ADD_VOCALS_LABEL}
        </button>
      </div>
    </div>
  );
}

export function vocalsSheetDefaults(moods?: readonly string[] | null, tempoMin?: number | null, tempoMax?: number | null) {
  return artistDefaults({ moods, tempoMin, tempoMax });
}
