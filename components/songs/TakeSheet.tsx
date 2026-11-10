'use client';

import { useEffect, useId } from 'react';
import { useRouter } from 'next/navigation';
import { TakePicker } from '@/components/songs/TakePicker';
import { useTakeSeed } from '@/components/songs/useTakeSeed';
import { PICK_TAKE_TITLE, buildTakeSlots, shouldShowTakePicker } from '@/lib/songs/takes';
import './pick-your-take.css';

interface TakeSheetProps {
  songId: string;
  onClose: () => void;
}

/** Same two-row picker as the song-ready screen, over the studio song row. */
export function TakeSheet({ songId, onClose }: TakeSheetProps) {
  const router = useRouter();
  const titleId = useId();
  const seed = useTakeSeed(songId, null, true);
  const showPicker = Boolean(seed && shouldShowTakePicker(buildTakeSlots(seed)));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
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
        {showPicker && seed ? (
          <TakePicker
            songId={songId}
            seed={seed}
            titleId={titleId}
            onSwitched={() => router.refresh()}
          />
        ) : (
          <h2 id={titleId} className="take-title">
            {PICK_TAKE_TITLE}
          </h2>
        )}
      </div>
    </div>
  );
}
