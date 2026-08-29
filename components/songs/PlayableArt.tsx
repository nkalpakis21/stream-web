'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSongPlayer } from '@/components/songs/SongPlayerProvider';
import { getSongVersions } from '@/lib/services/songs';
import { createDebouncedPlayTracker } from '@/lib/utils/playTracking';

interface PlayableArtProps {
  songId: string;
  title: string;
  artistName: string;
  coverUrl: string | null;
  audioUrl?: string | null;
  hasCoin?: boolean;
  href?: string;
  className?: string;
}

export function PlayableArt({
  songId,
  title,
  artistName,
  coverUrl,
  audioUrl: audioUrlProp,
  hasCoin = false,
  href,
  className = '',
}: PlayableArtProps) {
  const { play, nowPlaying, isPlaying, togglePlayPause } = useSongPlayer();
  const [resolvedAudio, setResolvedAudio] = useState<string | null>(audioUrlProp ?? null);
  const [loading, setLoading] = useState(false);
  const trackPlay = useMemo(() => createDebouncedPlayTracker(500), []);

  const isCurrent = nowPlaying?.audioUrl && resolvedAudio && nowPlaying.audioUrl === resolvedAudio;
  const showPause = Boolean(isCurrent && isPlaying);

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
      songTitle: title,
      artistName,
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
    <div className={`relative aspect-square overflow-hidden rounded-xl bg-muted ${className}`}>
      {href ? (
        <Link href={href} className="absolute inset-0" aria-label={`${title} by ${artistName}`}>
          {coverUrl ? (
            <Image src={coverUrl} alt="" fill className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" unoptimized />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-secondary" />
          )}
        </Link>
      ) : coverUrl ? (
        <Image src={coverUrl} alt="" fill className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" unoptimized />
      ) : (
        <div className="h-full w-full bg-secondary" />
      )}

      <button
        type="button"
        onClick={onPlay}
        className="absolute inset-0 z-10 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-white shadow-lg"
        aria-label={showPause ? `Pause ${title}` : `Play ${title}`}
      >
        {loading ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : showPause ? (
          <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        ) : (
          <svg className="ml-0.5 h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {hasCoin && (
        <span className="absolute bottom-2 right-2 z-10 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-primary">
          Coin
        </span>
      )}
    </div>
  );
}
