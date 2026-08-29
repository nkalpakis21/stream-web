'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSongPlayer } from '@/components/songs/SongPlayerProvider';
import { CoverImage } from '@/components/media/CoverImage';
import { getSongVersions } from '@/lib/services/songs';
import { createDebouncedPlayTracker } from '@/lib/utils/playTracking';

function formatClock(total: number): string {
  const sec = Math.max(0, Math.floor(total));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface PlayableArtProps {
  songId: string;
  title: string;
  artistName: string;
  artistId?: string;
  coverUrl: string | null;
  audioUrl?: string | null;
  hasCoin?: boolean;
  durationSeconds?: number | null;
  href?: string;
  className?: string;
}

export function PlayableArt({
  songId,
  title,
  artistName,
  artistId,
  coverUrl,
  audioUrl: audioUrlProp,
  hasCoin = false,
  durationSeconds = null,
  href,
  className = '',
}: PlayableArtProps) {
  const { play, nowPlaying, isPlaying, togglePlayPause } = useSongPlayer();
  const [resolvedAudio, setResolvedAudio] = useState<string | null>(audioUrlProp ?? null);
  const [loading, setLoading] = useState(false);
  const trackPlay = useMemo(() => createDebouncedPlayTracker(500), []);

  const isCurrent = Boolean(
    (nowPlaying?.songId && nowPlaying.songId === songId) ||
      (nowPlaying?.audioUrl && resolvedAudio && nowPlaying.audioUrl === resolvedAudio)
  );
  const showPause = Boolean(isCurrent && isPlaying);
  const playingCover = Boolean(isCurrent && isPlaying);
  const clock =
    durationSeconds != null && Number.isFinite(durationSeconds) && durationSeconds > 0
      ? formatClock(durationSeconds)
      : null;

  const startPlayback = async () => {
    let url = resolvedAudio;
    if (!url) {
      setLoading(true);
      try {
        const versions = await getSongVersions(songId);
        url =
          versions.find(v => v.isPrimary && v.audioURL)?.audioURL ||
          versions.find(v => v.audioURL)?.audioURL ||
          null;
        setResolvedAudio(url);
      } finally {
        setLoading(false);
      }
    }
    if (!url) return;
    play({
      songId,
      songTitle: title,
      artistName,
      artistId,
      albumCoverUrl: coverUrl,
      audioUrl: url,
    });
    trackPlay(songId);
  };

  const onPlay = () => {
    if (isCurrent) {
      togglePlayPause();
      return;
    }
    void startPlayback();
  };

  return (
    <div
      className={`rounded-[12px] ${className}`}
      style={playingCover ? { boxShadow: '0 0 0 2px var(--accent)' } : undefined}
    >
      <div className="relative aspect-square overflow-hidden rounded-[12px]">
        {href ? (
          <Link href={href} className="absolute inset-0" aria-label={`${title} by ${artistName}`}>
            <CoverImage src={coverUrl} title={title} sizes="(max-width: 768px) 50vw, 25vw" />
          </Link>
        ) : (
          <CoverImage src={coverUrl} title={title} sizes="(max-width: 768px) 50vw, 25vw" />
        )}

        <button
          type="button"
          onClick={onPlay}
          className="absolute inset-0 z-10 m-auto flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white shadow-lg"
          aria-label={showPause ? `Pause ${title}` : `Play ${title}`}
        >
          {loading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : showPause ? (
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="ml-0.5 h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {clock ? (
          <span className="absolute bottom-2 right-2 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
            {clock}
          </span>
        ) : hasCoin ? (
          <span className="absolute bottom-2 right-2 z-10 rounded-xl bg-black/70 px-2 py-0.5 text-[10px] font-medium text-primary">
            Coin
          </span>
        ) : null}
      </div>
    </div>
  );
}
