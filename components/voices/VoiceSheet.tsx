'use client';

import { useEffect, useId } from 'react';
import { VoicePicker, closeVoiceSheet } from '@/components/voices/VoicePicker';
import type { PublicStreamstarVoice, VoiceSlug } from '@/lib/voices/streamstarVoices';
import '@/components/songs/pick-your-take.css';

export function VoiceSheet({
  voices,
  selected,
  onSelect,
  onClose,
  confirm = false,
  onUse,
  currentSlug = null,
  busy = false,
  title = 'Voice',
}: {
  voices: readonly PublicStreamstarVoice[];
  selected: VoiceSlug | null;
  onSelect: (slug: VoiceSlug) => void;
  onClose: () => void;
  /** Change sheets confirm with "Use this voice". Create picks by tapping a row. */
  confirm?: boolean;
  onUse?: () => void;
  currentSlug?: VoiceSlug | null;
  busy?: boolean;
  title?: string;
}) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeVoiceSheet('escape', onClose);
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
      <button type="button" className="take-sheet-backdrop" aria-label="Dismiss" onClick={() => closeVoiceSheet('backdrop', onClose)} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="take-sheet-panel">
        <button type="button" className="take-sheet-close" aria-label="Close" onClick={() => closeVoiceSheet('escape', onClose)}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
            <path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <h2 id={titleId} className="take-title">
          {title}
        </h2>
        <div className="mt-4">
          <VoicePicker
            voices={voices}
            selected={selected}
            currentSlug={currentSlug}
            confirm={confirm}
            busy={busy}
            onSelect={slug => {
              if (!confirm) {
                closeVoiceSheet('voice', () => {
                  onSelect(slug);
                  onClose();
                });
                return;
              }
              onSelect(slug);
            }}
            onUse={() => closeVoiceSheet('use', () => onUse?.())}
          />
        </div>
      </div>
    </div>
  );
}
