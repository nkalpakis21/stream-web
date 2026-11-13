'use client';

import { useEffect, useRef, useState } from 'react';
import type { PublicStreamstarVoice, VoiceSlug } from '@/lib/voices/streamstarVoices';

export const VOICE_PICKER_SUBTITLE = 'This is how they sing.';
export const USE_THIS_VOICE_LABEL = 'Use this voice';

/** One clip at a time. The clip that is already playing stops. */
export function nextPreviewSlug(playing: string | null, clicked: string): string | null {
  return playing === clicked ? null : clicked;
}

export function VoicePicker({
  voices,
  selected,
  onSelect,
  onUse,
  busy = false,
  currentSlug = null,
  showSubtitle = true,
}: {
  voices: readonly PublicStreamstarVoice[];
  selected: VoiceSlug | null;
  onSelect: (slug: VoiceSlug) => void;
  onUse: () => void;
  busy?: boolean;
  /** Already on this artist or song. Visible, and not selectable again. */
  currentSlug?: VoiceSlug | null;
  showSubtitle?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<VoiceSlug | null>(null);
  const [unavailable, setUnavailable] = useState<VoiceSlug | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!playing) {
      audio.pause();
      return;
    }
    const voice = voices.find(item => item.slug === playing);
    if (!voice) return;
    if (audio.getAttribute('src') !== voice.previewUrl) {
      audio.src = voice.previewUrl;
    }
    const play = audio.play();
    if (play && typeof play.catch === 'function') {
      play.catch(() => setUnavailable(playing));
    }
  }, [playing, voices]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const canUse = selected != null && selected !== currentSlug && !busy;

  return (
    <div data-voice-picker>
      {showSubtitle ? (
        <p className="text-sm text-[#8B8896]" data-voice-subtitle>
          {VOICE_PICKER_SUBTITLE}
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-2" role="listbox" aria-label="Voices">
        {voices.map(voice => {
          const isSelected = selected === voice.slug;
          const isCurrent = currentSlug === voice.slug;
          const isPlaying = playing === voice.slug;
          return (
            <div
              key={voice.slug}
              role="option"
              aria-selected={isSelected}
              data-voice-row={voice.slug}
              data-selected={isSelected ? 'true' : 'false'}
              data-current={isCurrent ? 'true' : 'false'}
              className="flex items-center gap-3 rounded-[12px] border border-transparent px-3 py-3"
              style={{ background: isSelected ? '#2A2A38' : 'transparent' }}
            >
              <button
                type="button"
                aria-label={isPlaying ? `Stop ${voice.name}` : `Play ${voice.name}`}
                aria-pressed={isPlaying}
                data-preview={voice.slug}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#E8E6F2]"
                onClick={() => {
                  setUnavailable(null);
                  setPlaying(current => nextPreviewSlug(current, voice.slug) as VoiceSlug | null);
                }}
              >
                {isPlaying ? (
                  <span aria-hidden className="block h-3 w-3 rounded-[2px] bg-[#E8E6F2]" />
                ) : (
                  <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3">
                    <path d="M3 1.5v9l8-4.5-8-4.5z" fill="#E8E6F2" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                disabled={isCurrent || busy}
                onClick={() => onSelect(voice.slug)}
                className="min-w-0 flex-1 text-left disabled:opacity-40"
              >
                <span className="block text-sm font-medium text-[#F5F4F8]">{voice.name}</span>
                <span className="mt-0.5 block text-xs text-[#8B8896]" data-voice-descriptor>
                  {voice.descriptor}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <audio
        ref={audioRef}
        data-voice-audio
        preload="none"
        onEnded={() => setPlaying(null)}
        onError={() => {
          if (playing) setUnavailable(playing);
          setPlaying(null);
        }}
      />
      {unavailable ? (
        <p className="mt-2 text-xs text-[#8B8896]" data-preview-unavailable>
          Audio unavailable
        </p>
      ) : null}
      <button
        type="button"
        data-use-voice
        disabled={!canUse}
        onClick={onUse}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-[12px] bg-[#E8E6F2] px-4 text-sm font-semibold text-[#0A0A10] disabled:opacity-40"
      >
        {USE_THIS_VOICE_LABEL}
      </button>
    </div>
  );
}
