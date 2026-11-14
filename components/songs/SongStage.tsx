'use client';

import { useMemo, useState } from 'react';
import { PlayableArt } from '@/components/songs/PlayableArt';
import { CoverModerationNotice } from '@/components/songs/CoverModerationNotice';
import { ShareButton } from '@/components/songs/ShareButton';
import { ArtistFace } from '@/components/artists/ArtistFace';
import { MaybeArtistLink } from '@/components/songs/MaybeArtistLink';
import { AiMark } from '@/components/brand/AiMark';
import { useSongPlayer } from '@/components/songs/SongPlayerProvider';
import { reportSharePagePlay } from '@/lib/analytics/sharePlay';
import { coverFieldsFromSong, playerCoverPayload, type CoverFields } from '@/lib/covers/resolve';
import { artistFaceSources, songCoverCandidates } from '@/lib/images/artistFace';
import { createDebouncedPlayTracker } from '@/lib/utils/playTracking';
import { SongCoverStack } from '@/components/songs/SongCoverStack';

interface VersionOption {
  id: string;
  audioURL: string | null;
  isPrimary: boolean;
  audioExpired?: boolean;
  duration?: number | null;
}

interface SongStageProps {
  songId: string;
  songTitle: string;
  artistId: string | null;
  artistName: string;
  artistPhotoUrl?: string | null;
  artistLinkable?: boolean;
  albumCoverUrl: string | null;
  cover?: CoverFields;
  audioUrl: string | null;
  versions: VersionOption[];
  durationSeconds?: number | null;
  shareUrl: string;
  pending?: boolean;
  children?: React.ReactNode;
  emptyInitials?: string | null;
  ownerCoverNotice?: {
    message: string;
    action: 'replace' | 'retry';
    buttonLabel: string;
  } | null;
  /** Beat player. Sits under the cover, not in a separate screen. */
  belowCover?: React.ReactNode;
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
  artistPhotoUrl = null,
  artistLinkable = false,
  albumCoverUrl,
  cover,
  audioUrl,
  versions,
  durationSeconds = null,
  shareUrl,
  pending = false,
  children,
  emptyInitials = null,
  ownerCoverNotice = null,
  belowCover = null,
}: SongStageProps) {
  const playable = useMemo(
    () => versions.filter(v => v.audioURL && v.audioExpired !== true),
    [versions]
  );
  const { play } = useSongPlayer();
  const trackPlay = useMemo(() => createDebouncedPlayTracker(500), []);
  const [activeId, setActiveId] = useState(
    playable.find(v => v.isPrimary)?.id || playable[0]?.id || null
  );
  const active = playable.find(v => v.id === activeId) || playable[0];
  const currentAudio = active?.audioURL || audioUrl;
  const titleClock =
    durationSeconds != null && Number.isFinite(durationSeconds) && durationSeconds > 0
      ? formatClock(durationSeconds)
      : versionClock(active || { id: '', audioURL: null, isPrimary: false }, null);
  const coverFields = cover
    ? coverFieldsFromSong(cover)
    : coverFieldsFromSong({
        albumCoverPath: albumCoverUrl,
        albumCoverThumbnail: albumCoverUrl,
      });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
      <SongCoverStack
        cover={
          <>
            <PlayableArt
              songId={songId}
              title={songTitle}
              artistName={artistName}
              artistId={artistId || undefined}
              cover={coverFields}
              emptyInitials={emptyInitials}
              playback="always"
              audioUrl={currentAudio}
              durationSeconds={durationSeconds}
              sharePage
              className="w-full"
            />
            {ownerCoverNotice ? (
              <div className="mt-3">
                <CoverModerationNotice
                  songId={songId}
                  message={ownerCoverNotice.message}
                  action={ownerCoverNotice.action}
                  buttonLabel={ownerCoverNotice.buttonLabel}
                />
              </div>
            ) : null}
          </>
        }
        below={belowCover}
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="listen-h1" data-entity="track">{songTitle}</h1>
          {titleClock ? (
            <span className="song-stage-duration">{titleClock}</span>
          ) : null}
          <AiMark />
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          <ArtistFace
            name={artistName}
            sources={artistFaceSources(artistPhotoUrl, songCoverCandidates(coverFields))}
            size="row"
          />
          <MaybeArtistLink
            artistId={artistId}
            linkable={artistLinkable}
            className={
              artistLinkable
                ? 'inline-block text-lg text-primary underline-offset-4 hover:underline'
                : 'inline-block text-lg text-muted-foreground'
            }
            dataEntity="artist"
          >
            {artistName}
          </MaybeArtistLink>
        </div>
        {pending && !currentAudio && (
          <div
            className="mt-6 rounded-lg border px-4 py-5"
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
                      reportSharePagePlay(songId, artistId || undefined);
                      trackPlay(songId, { skipFunnel: true });
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
          <ShareButton
            url={shareUrl}
            title={songTitle}
            artistName={artistName}
            songId={songId}
            artistId={artistId || undefined}
          />
        </div>
        {children}
      </div>
    </div>
  );
}
