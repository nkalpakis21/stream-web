'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { PlayerCoinChip } from './PlayerCoinChip';
import './listen-player.css';

interface PlayingTrack {
  songTitle: string;
  artistName: string;
  artistId?: string;
  albumCoverUrl: string | null;
  audioUrl: string;
}

interface ListenPlayerProps {
  nowPlaying: PlayingTrack | null;
  isPlaying: boolean;
  canPrev: boolean;
  canNext: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onEnded: () => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function seekFromClientX(el: HTMLElement, clientX: number, duration: number): number {
  if (duration <= 0) return 0;
  const rect = el.getBoundingClientRect();
  const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  return Math.min(duration, Math.max(0, ratio * duration));
}

export function ListenPlayer({
  nowPlaying,
  isPlaying,
  canPrev,
  canNext,
  onToggle,
  onPrev,
  onNext,
  onEnded,
}: ListenPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  const audioUrl = nowPlaying?.audioUrl ?? '';
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const hasTrack = Boolean(nowPlaying);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      window.dispatchEvent(
        new CustomEvent('audio-timeupdate', {
          detail: { currentTime: time },
        })
      );
    };
    const updateDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const handleEnded = () => {
      setCurrentTime(0);
      onEnded();
    };
    const handleLyricsSeek = (e: Event) => {
      const customEvent = e as CustomEvent<{ timestamp: number }>;
      if (audio && Number.isFinite(customEvent.detail.timestamp)) {
        audio.currentTime = customEvent.detail.timestamp;
        setCurrentTime(customEvent.detail.timestamp);
      }
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);
    window.addEventListener('lyrics-seek', handleLyricsSeek);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
      window.removeEventListener('lyrics-seek', handleLyricsSeek);
    };
  }, [audioUrl, onEnded]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audioUrl) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      setCurrentTime(0);
      setDuration(0);
      return;
    }
    if (isPlaying) {
      audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [isPlaying, audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  const seekTo = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (!audio || duration <= 0) return;
      audio.currentTime = time;
      setCurrentTime(time);
    },
    [duration]
  );

  const onScrubClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!hasTrack) return;
    seekTo(seekFromClientX(e.currentTarget, e.clientX, duration));
  };

  return (
    <div className="listen-player" data-listen-player>
      <audio ref={audioRef} src={audioUrl || undefined} preload="metadata" />

      <button
        type="button"
        className="listen-player-edge"
        onClick={onScrubClick}
        disabled={!hasTrack || duration <= 0}
        aria-label="Seek"
      >
        <span className="listen-player-edge-fill" style={{ width: `${progress}%` }} />
      </button>

      <div className="listen-player-inner">
        <div className="listen-player-art" aria-hidden={!nowPlaying?.albumCoverUrl}>
          {nowPlaying?.albumCoverUrl ? (
            <Image
              src={nowPlaying.albumCoverUrl}
              alt=""
              fill
              unoptimized
              className="object-cover"
              sizes="56px"
            />
          ) : null}
        </div>

        <div className="listen-player-meta">
          <p className="listen-player-title" data-entity="track">
            {nowPlaying?.songTitle || 'Nothing playing'}
          </p>
          <div className="listen-player-artist-row">
            <p className="listen-player-artist" data-entity="artist">
              {nowPlaying?.artistName || ''}
            </p>
            <PlayerCoinChip artistId={nowPlaying?.artistId} />
          </div>
        </div>

        <div className="listen-player-controls">
          <button
            type="button"
            className="listen-player-skip"
            onClick={onPrev}
            disabled={!canPrev}
            aria-label="Previous"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z" />
            </svg>
          </button>
          <button
            type="button"
            className="listen-player-pause"
            onClick={onToggle}
            disabled={!hasTrack}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="listen-player-skip"
            onClick={onNext}
            disabled={!canNext}
            aria-label="Next"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M16 6h2v12h-2V6zM6 18l8.5-6L6 6v12z" />
            </svg>
          </button>
        </div>

        <div className="listen-player-desk">
          <span className="listen-player-time">{formatTime(currentTime)}</span>
          <button
            type="button"
            className="listen-player-scrub"
            onClick={onScrubClick}
            disabled={!hasTrack || duration <= 0}
            aria-label="Seek"
          >
            <span className="listen-player-scrub-track">
              <span className="listen-player-scrub-fill" style={{ width: `${progress}%` }} />
            </span>
            <span className="listen-player-scrub-knob" style={{ left: `${progress}%` }} />
          </button>
          <span className="listen-player-time">{formatTime(duration)}</span>
          <input
            type="range"
            className="listen-player-volume"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={e => setVolume(Number.parseFloat(e.target.value))}
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  );
}
