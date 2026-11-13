'use client';

import { useEffect, useId, useState } from 'react';
import { VoicePicker } from '@/components/voices/VoicePicker';
import {
  CHANGING_VOICE_LABEL,
  CHANGE_VOICE_SUBTITLE,
  CHANGE_VOICE_TITLE,
  SPLIT_VOCAL_CAVEAT,
} from '@/lib/songs/voiceChange';
import type { PublicStreamstarVoice, VoiceSlug } from '@/lib/voices/streamstarVoices';
import './pick-your-take.css';

export function ChangeVoiceSheet({
  voices,
  currentSlug = null,
  splitCaveat = false,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  voices: readonly PublicStreamstarVoice[];
  currentSlug?: VoiceSlug | null;
  /** Finished songs that sing over a split beat. Never set on beat-first. */
  splitCaveat?: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (voice: VoiceSlug) => void;
}) {
  const [selected, setSelected] = useState<VoiceSlug | null>(null);
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
    <div className="take-sheet" data-voice-sheet>
      <button type="button" className="take-sheet-backdrop" aria-label="Dismiss" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="take-sheet-panel">
        <button type="button" className="take-sheet-close" aria-label="Close" onClick={onClose}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
            <path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <h2 id={titleId} className="take-title">
          {CHANGE_VOICE_TITLE}
        </h2>
        <p className="mt-2 text-sm text-[#8B8896]">{CHANGE_VOICE_SUBTITLE}</p>
        {splitCaveat ? (
          <p className="mt-2 text-sm text-[#8B8896]" data-voice-split-caveat>
            {SPLIT_VOCAL_CAVEAT}
          </p>
        ) : null}
        {error ? (
          <p className="take-error mt-3" role="alert">
            {error}
          </p>
        ) : null}
        {busy ? (
          <p className="mt-4 text-sm text-[#8B8896]" data-voice-making>
            {CHANGING_VOICE_LABEL}
          </p>
        ) : (
          <div className="mt-4" data-voice-list="curated">
            <VoicePicker
              voices={voices}
              selected={selected}
              currentSlug={currentSlug}
              onSelect={setSelected}
              onUse={() => {
                if (selected) onSubmit(selected);
              }}
              busy={busy}
            />
          </div>
        )}
      </div>
    </div>
  );
}
