'use client';

import { useEffect, useId } from 'react';
import { SongCustomizePanel } from '@/components/create/SongCustomizePanel';
import { CHANGE_THE_FEEL_LABEL, makeNewBeatLabel, retriesLeft } from '@/lib/songs/beatFirst';
import type { ArtistDefaults, SongCustomizeValue } from '@/lib/create/songOptions';
import './pick-your-take.css';

/** Feel chips and Energy, in a sheet. Does not leave the song page. */
export function ChangeFeelSheet({
  artistName,
  defaults,
  value,
  onChange,
  onClose,
  retriesUsed,
  busy,
  error,
  onMake,
}: {
  artistName?: string | null;
  defaults: ArtistDefaults;
  value: SongCustomizeValue;
  onChange: (value: SongCustomizeValue) => void;
  onClose: () => void;
  retriesUsed: number;
  busy?: boolean;
  error?: string | null;
  onMake: () => void;
}) {
  const titleId = useId();

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
    <div className="take-sheet" data-feel-sheet>
      <button type="button" className="take-sheet-backdrop" aria-label="Dismiss" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="take-sheet-panel">
        <button type="button" className="take-sheet-close" aria-label="Close" onClick={onClose}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
            <path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <h2 id={titleId} className="take-title">
          {CHANGE_THE_FEEL_LABEL}
        </h2>
        <div className="mt-4">
          <SongCustomizePanel
            artistName={artistName}
            defaults={defaults}
            value={value}
            onChange={onChange}
            prompt=""
            part="feel-energy"
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
          disabled={busy || retriesLeft(retriesUsed) <= 0}
          onClick={onMake}
        >
          {makeNewBeatLabel(retriesUsed)}
        </button>
      </div>
    </div>
  );
}
