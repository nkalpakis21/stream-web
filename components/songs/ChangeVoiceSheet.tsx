'use client';

import { useEffect, useId } from 'react';
import type { SungGender } from '@/lib/songs/voiceChange';
import {
  CHANGING_VOICE_LABEL,
  CHANGE_VOICE_SUBTITLE,
  CHANGE_VOICE_TITLE,
  singVoiceLabel,
} from '@/lib/songs/voiceChange';
import './pick-your-take.css';

export function ChangeVoiceSheet({
  voices,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  /** One button for the other voice, or both when the current voice is unknown. */
  voices: readonly SungGender[];
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (voice: SungGender) => void;
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
          <div
            className={voices.length > 1 ? 'mt-4 grid grid-cols-2 gap-2' : 'mt-4'}
            data-voice-buttons={voices.length > 1 ? 'both' : 'one'}
          >
            {voices.map((voice) => (
              <button
                key={voice}
                type="button"
                data-sing-voice={voice}
                className={
                  voices.length > 1
                    ? 'inline-flex min-h-11 w-full items-center justify-center rounded-[12px] border border-[#2A2A38] bg-transparent px-3 text-sm font-semibold text-[#F5F4F8]'
                    : 'inline-flex min-h-11 w-full items-center justify-center rounded-[12px] bg-[#E8E6F2] px-4 text-sm font-semibold text-[#0A0A10]'
                }
                onClick={() => onSubmit(voice)}
              >
                {singVoiceLabel(voice)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
