'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  KEEP_ORIGINAL_LABEL,
  KEEP_VOICE_LABEL,
  PICK_VOICE_TITLE,
  type CompareRow,
  type CompareRowKey,
} from '@/lib/songs/voiceChange';
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

export function VoiceCompare({
  rows,
  selected,
  onSelect,
  onKeep,
  onKeepOriginal,
  keeping,
  error,
}: {
  rows: [CompareRow, CompareRow, CompareRow];
  selected: CompareRowKey;
  onSelect: (key: CompareRowKey) => void;
  onKeep: (row: CompareRow) => void;
  onKeepOriginal: () => void;
  keeping?: boolean;
  error?: string | null;
}) {
  const titleId = useId();
  const audioRefs = useRef<Record<CompareRowKey, HTMLAudioElement | null>>({
    original: null,
    1: null,
    2: null,
  });
  const [playing, setPlaying] = useState<CompareRowKey | null>(null);
  const [clock, setClock] = useState<Record<CompareRowKey, { time: number; duration: number }>>({
    original: { time: 0, duration: 0 },
    1: { time: 0, duration: 0 },
    2: { time: 0, duration: 0 },
  });
  const urls = rows.map((row) => row.audioUrl ?? '').join('|');
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    rowsRef.current.forEach((row) => {
      const el = audioRefs.current[row.key];
      if (!el) return;
      const onTime = () => {
        setClock((current) => ({
          ...current,
          [row.key]: {
            time: el.currentTime || 0,
            duration: Number.isFinite(el.duration) ? el.duration : 0,
          },
        }));
      };
      const onPlaying = () => setPlaying(row.key);
      const onPaused = () => setPlaying((current) => (current === row.key ? null : current));
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
  }, [urls]);

  const playRow = (key: CompareRowKey) => {
    onSelect(key);
    const mine = audioRefs.current[key];
    (['original', '1', '2'] as const).forEach((other) => {
      if (other !== key) audioRefs.current[other]?.pause();
    });
    if (!mine) return;
    if (playing === key && !mine.paused) {
      mine.pause();
      return;
    }
    void mine.play().catch(() => {
      setPlaying((current) => (current === key ? null : current));
    });
  };

  return (
    <section className="take-picker" data-voice-compare aria-labelledby={titleId}>
      <h2 id={titleId} className="take-title">
        {PICK_VOICE_TITLE}
      </h2>
      <div className="take-list">
        {rows.map((row) => {
          const isSelected = selected === row.key;
          const rowClass = isSelected ? 'take-row is-selected' : 'take-row';
          if (row.status !== 'ready' || !row.audioUrl) {
            const message =
              row.status === 'failed' ? `${row.label} didn't come through.` : `${row.label} is still coming…`;
            return (
              <div key={row.key} className={rowClass} data-voice-row={row.key} data-voice-status={row.status}>
                <p className="take-pending">{message}</p>
              </div>
            );
          }
          const timing = clock[row.key];
          return (
            <div key={row.key} className={rowClass} data-voice-row={row.key} data-voice-status="ready">
              <div className="take-main">
                <button
                  type="button"
                  className="song-play-orb take-orb"
                  aria-label={playing === row.key ? `Pause ${row.label}` : `Play ${row.label}`}
                  onClick={() => playRow(row.key)}
                >
                  <PlayGlyph paused={playing === row.key} />
                </button>
                <button
                  type="button"
                  className="take-select"
                  aria-pressed={isSelected}
                  onClick={() => onSelect(row.key)}
                >
                  <span>{row.label}</span>
                </button>
              </div>
              <input
                type="range"
                className="take-scrub"
                min={0}
                max={timing.duration || 0}
                step={0.1}
                value={timing.duration > 0 ? Math.min(timing.time, timing.duration) : 0}
                aria-label={`${row.label} scrubber`}
                disabled={timing.duration <= 0}
                onPointerDown={() => onSelect(row.key)}
                onChange={(event) => {
                  const el = audioRefs.current[row.key];
                  const next = Number(event.target.value);
                  if (!el || !Number.isFinite(next)) return;
                  el.currentTime = next;
                  setClock((current) => ({
                    ...current,
                    [row.key]: { ...current[row.key], time: next },
                  }));
                }}
              />
              {isSelected && row.key !== 'original' ? (
                <button
                  type="button"
                  className="take-use"
                  disabled={keeping}
                  onClick={() => onKeep(row)}
                >
                  {KEEP_VOICE_LABEL}
                </button>
              ) : null}
              <audio
                ref={(el) => {
                  audioRefs.current[row.key] = el;
                }}
                src={row.audioUrl}
                preload="none"
              />
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="take-switch"
        data-keep-original
        disabled={keeping}
        onClick={onKeepOriginal}
      >
        {KEEP_ORIGINAL_LABEL}
      </button>
      {error ? (
        <p className="take-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
