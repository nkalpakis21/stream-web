'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CURRENT_TAKE_LABEL,
  PICK_TAKE_TITLE,
  SWITCHING_TAKE_LABEL,
  TAKE_2_FAILED,
  TAKE_2_PENDING,
  USE_TAKE_LABEL,
  type TakeNumber,
  type TakeSlot,
} from '@/lib/songs/takes';
import './pick-your-take.css';

interface PickYourTakeProps {
  slots: [TakeSlot, TakeSlot];
  selected: TakeNumber;
  onSelect: (take: TakeNumber) => void;
  onUse: (slot: TakeSlot) => void;
  using?: boolean;
  error?: string | null;
  titleId: string;
}

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

export function PickYourTake({
  slots,
  selected,
  onSelect,
  onUse,
  using = false,
  error = null,
  titleId,
}: PickYourTakeProps) {
  const take1Url = slots[0].audioUrl;
  const take2Url = slots[1].audioUrl;
  const audioRefs = useRef<Record<TakeNumber, HTMLAudioElement | null>>({ 1: null, 2: null });
  const [playing, setPlaying] = useState<TakeNumber | null>(null);
  const [clock, setClock] = useState<Record<TakeNumber, { time: number; duration: number }>>({
    1: { time: 0, duration: 0 },
    2: { time: 0, duration: 0 },
  });

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
        el.removeEventListener('timeupdate', onTime);
        el.removeEventListener('loadedmetadata', onTime);
        el.removeEventListener('play', onPlaying);
        el.removeEventListener('pause', onPaused);
        el.removeEventListener('ended', onPaused);
      });
    });
    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [take1Url, take2Url]);

  const playTake = (take: TakeNumber) => {
    onSelect(take);
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

  return (
    <section className="take-picker" aria-labelledby={titleId}>
      <h2 id={titleId} className="take-title">
        {PICK_TAKE_TITLE}
      </h2>
      <div className="take-list">
        {slots.map((slot) => {
          const rowClass = slot.isCurrent
            ? 'take-row is-current'
            : selected === slot.take
              ? 'take-row is-selected'
              : 'take-row';
          if (slot.status !== 'ready') {
            const message =
              slot.take === 2
                ? slot.status === 'failed'
                  ? TAKE_2_FAILED
                  : TAKE_2_PENDING
                : slot.label;
            return (
              <div key={slot.take} className={rowClass} data-take={slot.take} data-take-status={slot.status}>
                <button type="button" className="take-select" aria-pressed={false} disabled>
                  <span className={slot.status === 'failed' ? 'take-failed' : 'take-pending'}>{message}</span>
                </button>
              </div>
            );
          }
          const timing = clock[slot.take];
          const showUse = selected === slot.take && !slot.isCurrent;
          return (
            <div key={slot.take} className={rowClass} data-take={slot.take} data-take-status="ready">
              <div className="take-main">
                <button
                  type="button"
                  className="song-play-orb take-orb"
                  aria-label={playing === slot.take ? `Pause ${slot.label}` : `Play ${slot.label}`}
                  onClick={() => playTake(slot.take)}
                >
                  <PlayGlyph paused={playing === slot.take} />
                </button>
                <button
                  type="button"
                  className="take-select"
                  aria-pressed={selected === slot.take}
                  onClick={() => onSelect(slot.take)}
                >
                  <span>{slot.label}</span>
                  {slot.isCurrent ? <span className="take-current-tag">{CURRENT_TAKE_LABEL}</span> : null}
                </button>
              </div>
              <input
                type="range"
                className="take-scrub"
                min={0}
                max={timing.duration || 0}
                step={0.1}
                value={timing.duration > 0 ? Math.min(timing.time, timing.duration) : 0}
                aria-label={`${slot.label} scrubber`}
                disabled={timing.duration <= 0}
                onPointerDown={() => onSelect(slot.take)}
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
              {showUse ? (
                <button
                  type="button"
                  className="take-use"
                  onClick={() => onUse(slot)}
                  disabled={using}
                >
                  {using ? SWITCHING_TAKE_LABEL : USE_TAKE_LABEL}
                </button>
              ) : null}
              <audio
                ref={(el) => {
                  audioRefs.current[slot.take] = el;
                }}
                src={slot.audioUrl ?? undefined}
                preload="none"
              />
            </div>
          );
        })}
      </div>
      {error ? (
        <p className="take-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
