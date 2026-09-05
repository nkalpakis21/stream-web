'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PlayableArt } from '@/components/songs/PlayableArt';
import { ShareButton } from '@/components/songs/ShareButton';
import { SongCoinCluster } from '@/components/songs/SongCoinCluster';
import { AiMark } from '@/components/brand/AiMark';
import { useSongPlayer } from '@/components/songs/SongPlayerProvider';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import { coverFieldsFromSong, playerCoverPayload, type CoverFields } from '@/lib/covers/resolve';

interface VersionOption {
  id: string;
  audioURL: string | null;
  isPrimary: boolean;
  duration?: number | null;
}

interface SongStageProps {
  songId: string;
  songTitle: string;
  artistId: string | null;
  artistName: string;
  albumCoverUrl: string | null;
  cover?: CoverFields;
  audioUrl: string | null;
  versions: VersionOption[];
  durationSeconds?: number | null;
  coin?: ArtistCoinQuote | null;
  buyUrl?: string | null;
  shareUrl: string;
  pending?: boolean;
  children?: React.ReactNode;
}

function formatClock(total: number): string {
  const sec = Math.max(0, Math.floor(total));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function versionClock(version: VersionOption, fallback?: number | null): string | null {
  const seconds =
    version.duration != null && Number.isFinite(version.duration) && version.duration > 0
      ? version.duration
      : fallback != null && Number.isFinite(fallback) && fallback > 0
        ? fallback
        : null;
  return seconds != null ? formatClock(seconds) : null;
}

export function SongStage({
  songId,
  songTitle,
  artistId,
  artistName,
  albumCoverUrl,
  cover,
  audioUrl,
  versions,
  durationSeconds = null,
  coin = null,
  buyUrl = null,
  shareUrl,
  pending = false,
  children,
}: SongStageProps) {
  const playable = useMemo(
    () => versions.filter(v => v.audioURL),
    [versions]
  );
  const { play } = useSongPlayer();
  const [activeId, setActiveId] = useState(
    playable.find(v => v.isPrimary)?.id || playable[0]?.id || null
  );
  const active = playable.find(v => v.id === activeId) || playable[0];
  const currentAudio = active?.audioURL || audioUrl;
  const titleClock =
    durationSeconds != null && Number.isFinite(durationSeconds) && durationSeconds > 0
      ? formatClock(durationSeconds)
      : versionClock(active || { id: '', audioURL: null, isPrimary: false }, null);
  const coverFields = coverFieldsFromSong({
    ...cover,
    albumCoverPath: cover?.albumCoverPath ?? albumCoverUrl,
    albumCoverThumbnail: cover?.albumCoverThumbnail ?? albumCoverUrl,
  });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
      <PlayableArt
        songId={songId}
        title={songTitle}
        artistName={artistName}
        artistId={artistId || undefined}
        cover={coverFields}
        playback="always"
        audioUrl={currentAudio}
        durationSeconds={durationSeconds}
        className="w-full"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="listen-h1" data-entity="track">{songTitle}</h1>
          {titleClock ? (
            <span className="song-stage-duration">{titleClock}</span>
          ) : null}
          <AiMark />
        </div>
        {artistId ? (
          <Link href={`/artists/${artistId}`} className="mt-2 inline-block text-lg text-primary underline-offset-4 hover:underline" data-entity="artist">
            {artistName}
          </Link>
        ) : (
          <p className="mt-2 text-lg text-muted-foreground" data-entity="artist">{artistName}</p>
        )}
        <SongCoinCluster artistId={artistId} quote={coin} buyUrl={buyUrl} />
        {pending && !currentAudio && (
          <div
            className="mt-6 rounded-xl border px-4 py-5"
            style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
          >
            <p className="text-sm font-medium text-foreground">Making the track</p>
            <p className="mt-1 text-sm text-muted-foreground">This usually takes a minute. Stay here and it will play when ready.</p>
          </div>
        )}

        {playable.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {playable.map((version, index) => {
              const label = String.fromCharCode(65 + index);
              const selected = version.id === (active?.id ?? activeId);
              const clock = versionClock(version, durationSeconds);
              return (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => {
                    setActiveId(version.id);
                    if (version.audioURL) {
                      play({
                        songId,
                        songTitle,
                        artistName,
                        artistId: artistId || undefined,
                        ...playerCoverPayload(coverFields),
                        audioUrl: version.audioURL,
                      });
                    }
                  }}
                  className={`song-stage-chip ${selected ? 'is-selected' : ''}`}
                >
                  {clock ? `Version ${label} · ${clock}` : `Version ${label}`}
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-6">
          <ShareButton url={shareUrl} title={songTitle} artistName={artistName} />
        </div>
        {children}
      </div>
    </div>
  );
}
