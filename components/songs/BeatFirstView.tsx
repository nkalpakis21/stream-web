'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ADD_VOCALS_LABEL,
  CHANGE_THE_FEEL_LABEL,
  MAKING_BEAT_LABEL,
  NO_BEATS_LEFT_LABEL,
  USE_AS_IS_LABEL,
  retriesLeft,
  tryAnotherBeatLabel,
} from '@/lib/songs/beatFirst';
import type { TakeNumber, TakeSlot } from '@/lib/songs/takes';
import './pick-your-take.css';

function PlayGlyph({ paused }: { paused: boolean }) {
  if (paused) {
    return (
      <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
      </svg>
    );
  }
  return (
    <svg className="ml-0.5 h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function BeatFirstView({
  slots,
  retriesUsed,
  making,
  busy,
  error,
  onAddVocals,
  onRetry,
  onChangeFeel,
  onKeep,
}: {
  slots: [TakeSlot, TakeSlot] | null;
  retriesUsed: number;
  making: boolean;
  busy?: boolean;
  error?: string | null;
  onAddVocals: (slot: TakeSlot) => void;
  onRetry: () => void;
  onChangeFeel: () => void;
  onKeep: (slot: TakeSlot) => void;
}) {
  const ready = (slots ?? []).filter((slot) => slot.status === 'ready' && slot.audioUrl);
  const audioRefs = useRef<Record<TakeNumber, HTMLAudioElement | null>>({ 1: null, 2: null });
  const [playing, setPlaying] = useState<TakeNumber | null>(null);
  const [selected, setSelected] = useState<TakeNumber>(ready[0]?.take ?? 1);
  const [clock, setClock] = useState<Record<TakeNumber, { time: number; duration: number }>>({
    1: { time: 0, duration: 0 },
    2: { time: 0, duration: 0 },
  });
  const selectedSlot = ready.find((slot) => slot.take === selected) ?? ready[0] ?? null;
  const beatsLeft = retriesLeft(retriesUsed);
  const retryLabel = tryAnotherBeatLabel(retriesUsed);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    ([1, 2] as const).forEach((take) => {
      const el = audioRefs.current[take];
      if (!el) return;
      const onTime = () => {
        setClock((current) => ({
          ...current,
          [take]: {
            time: el.currentTime || 0,
            duration: Number.isFinite(el.duration) ? el.duration : 0,
          },
        }));
      };
      const onPlaying = () => setPlaying(take);
      const onPaused = () => setPlaying((current) => (current === take ? null : current));
      el.addEventListener('timeupdate', onTime);
      el.addEventListener('loadedmetadata', onTime);
      el.addEventListener('play', onPlaying);
      el.addEventListener('pause', onPaused);
      el.addEventListener('ended', onPaused);
      cleanups.push(() => {
        el.pause();
        el.removeEventListener('timeupdate', onTime);
        el.removeEventListener('loadedmetadata', onTime);
        el.removeEventListener('play', onPlaying);
        el.removeEventListener('pause', onPaused);
        el.removeEventListener('ended', onPaused);
      });
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [slots]);

  const playTake = (take: TakeNumber) => {
    setSelected(take);
    const mine = audioRefs.current[take];
    const other = audioRefs.current[take === 1 ? 2 : 1];
    other?.pause();
    if (!mine) return;
    if (playing === take && !mine.paused) {
      mine.pause();
      return;
    }
    void mine.play().catch(() => {
      setPlaying((current) => (current === take ? null : current));
    });
  };

  if (making && ready.length === 0) {
    return (
      <p className="text-sm text-[#8B8896]" data-beat-screen="making">
        {MAKING_BEAT_LABEL}
      </p>
    );
  }

  return (
    <section className="take-picker" data-beat-screen="ready" aria-label="Hear the beat">
      <h2 className="take-title">Hear the beat</h2>
      <div className="take-list">
        {(slots ?? []).map((slot) => {
          const label = slot.take === 1 ? 'Beat 1' : 'Beat 2';
          if (slot.status !== 'ready' || !slot.audioUrl) {
            return (
              <div key={slot.take} className="take-row" data-beat={slot.take} data-beat-status={slot.status}>
                <p className="take-pending">{slot.status === 'failed' ? `${label} didn't come through.` : `${label} is still coming…`}</p>
              </div>
            );
          }
          const timing = clock[slot.take];
          const isSelected = selectedSlot?.take === slot.take;
          return (
            <div
              key={slot.take}
              className={isSelected ? 'take-row is-selected' : 'take-row'}
              data-beat={slot.take}
              data-beat-status="ready"
            >
              <div className="take-main">
                <button
                  type="button"
                  className="song-play-orb take-orb"
                  aria-label={playing === slot.take ? `Pause ${label}` : `Play ${label}`}
                  onClick={() => playTake(slot.take)}
                >
                  <PlayGlyph paused={playing === slot.take} />
                </button>
                <button type="button" className="take-select" aria-pressed={isSelected} onClick={() => setSelected(slot.take)}>
                  <span>{label}</span>
                </button>
              </div>
              <input
                type="range"
                className="take-scrub"
                min={0}
                max={timing.duration || 0}
                step={0.1}
                value={timing.duration > 0 ? Math.min(timing.time, timing.duration) : 0}
                aria-label={`${label} scrubber`}
                disabled={timing.duration <= 0}
                onPointerDown={() => setSelected(slot.take)}
                onChange={(event) => {
                  const el = audioRefs.current[slot.take];
                  const next = Number(event.target.value);
                  if (!el || !Number.isFinite(next)) return;
                  el.currentTime = next;
                  setClock((current) => ({
                    ...current,
                    [slot.take]: { ...current[slot.take], time: next },
                  }));
                }}
              />
              <audio
                ref={(el) => {
                  audioRefs.current[slot.take] = el;
                }}
                src={slot.audioUrl}
                preload="none"
              />
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-[12px] bg-[#E8E6F2] px-4 text-sm font-semibold text-[#0A0A10] disabled:opacity-40"
        disabled={!selectedSlot || busy}
        onClick={() => selectedSlot && onAddVocals(selectedSlot)}
      >
        {ADD_VOCALS_LABEL}
      </button>
      <button
        type="button"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-[12px] border border-[#2A2A38] bg-transparent px-4 text-sm font-semibold text-[#F5F4F8] disabled:opacity-40"
        disabled={busy || beatsLeft <= 0}
        aria-disabled={beatsLeft <= 0 || busy ? true : undefined}
        onClick={onRetry}
      >
        {beatsLeft <= 0 ? NO_BEATS_LEFT_LABEL : retryLabel}
      </button>
      <button
        type="button"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-[#E8E6F2] disabled:opacity-40"
        disabled={busy}
        onClick={onChangeFeel}
      >
        {CHANGE_THE_FEEL_LABEL}
      </button>
      <button
        type="button"
        className="take-switch"
        data-beat-keep
        disabled={!selectedSlot || busy}
        onClick={() => selectedSlot && onKeep(selectedSlot)}
      >
        {USE_AS_IS_LABEL}
      </button>
      {error ? (
        <p className="take-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
