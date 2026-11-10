'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, onSnapshot } from 'firebase/firestore';
import type { Plain } from '@/lib/serialize/toPlain';
import type { SongDocument } from '@/types/firestore';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import { PlayableArt } from '@/components/songs/PlayableArt';
import { CoinBadge } from '@/components/songs/CoinBadge';
import { ArtistCoinRow } from '@/components/songs/ArtistCoinRow';
import { ArtistFace } from '@/components/artists/ArtistFace';
import { MaybeArtistLink } from '@/components/songs/MaybeArtistLink';
import { resolveVisibleCover, type CoverModerationStatus } from '@/lib/covers/moderation';
import { artistFaceSources, songCoverCandidates } from '@/lib/images/artistFace';
import { useCoverModerationEnabled } from '@/components/providers/CoverModerationProvider';
import { CoverModerationNotice } from '@/components/songs/CoverModerationNotice';
import { songShowsPrivateTag } from '@/lib/artists/ownerSongs';
import { db } from '@/lib/firebase/config';
import { getSongPath } from '@/lib/firebase/collections';
import {
  GENERATION_TIMEOUT_MS,
  attachOwnerSongListener,
  generationStartedAtMs,
  mergeOwnerSongSnapshot,
  ownerSongTileState,
  shouldListenForOwnerSong,
  type OwnerSongSnapshot,
  type OwnerTileSong,
} from '@/lib/songs/ownerTile';
import type { ArtistCardDisplay } from '@/lib/artists/cardDisplay';
import { PrivateSongTag } from '@/components/songs/PrivateSongTag';
import { UnavailableAudioRow } from '@/components/songs/UnavailableAudioRow';

function useLiveOwnerSong<T extends OwnerTileSong & { id: string }>(
  song: T,
  ownerCatalog: boolean
): T {
  const [live, setLive] = useState(song);
  const listen = shouldListenForOwnerSong(live, ownerCatalog);

  useEffect(() => {
    setLive(song);
  }, [song]);

  useEffect(() => {
    if (!listen) return;
    return attachOwnerSongListener(
      true,
      (onSnap) =>
        onSnapshot(doc(db, getSongPath(song.id)), (snap) => {
          if (!snap.exists()) return;
          onSnap(snap.data() as OwnerSongSnapshot);
        }),
      (snap) => {
        setLive((current) => mergeOwnerSongSnapshot(current, snap));
      }
    );
  }, [listen, song.id]);

  return live;
}

interface SongCardProps {
  song: SongDocument | Plain<SongDocument>;
  artistName?: string;
  artist?: ArtistCardDisplay | null;
  variant?: 'default' | 'glass';
  size?: 'default' | 'compact';
  ticker?: string | null;
  coinIcon?: string | null;
  coin?: ArtistCoinQuote | null;
  /** Owner catalogs only. Fans never pass this, so a private song cannot grow a tag. */
  ownerCatalog?: boolean;
}

export function SongCard({
  song,
  artistName,
  artist = null,
  size = 'default',
  ticker = null,
  coinIcon = null,
  coin = null,
  ownerCatalog = false,
}: SongCardProps) {
  const moderationEnabled = useCoverModerationEnabled();
  const shown = useLiveOwnerSong(song, ownerCatalog);
  const [statusOverride, setStatusOverride] = useState<CoverModerationStatus | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isCompact = size === 'compact';
  const showTicker = Boolean(ticker?.trim());
  const name = artist?.name || artistName;
  const linkable = artist?.isPublic === true;
  const photoUrl = artist?.photoUrl ?? null;
  const showPrivate = songShowsPrivateTag(shown, ownerCatalog);
  const visibleSong = statusOverride
    ? { ...shown, coverModeration: { status: statusOverride, checkedAt: null, labels: null } }
    : shown;
  const visible = resolveVisibleCover(visibleSong, {
    enabled: moderationEnabled,
    faceUrl: photoUrl,
    artistName: name || 'Artist',
  });
  const notice = ownerCatalog ? visible.notice : null;

  useEffect(() => {
    setStatusOverride(null);
  }, [shown.id, shown.coverPosterUrl, shown.coverModeration?.status]);

  useEffect(() => {
    if (!shouldListenForOwnerSong(shown, ownerCatalog)) return;
    const started = generationStartedAtMs(shown);
    if (started == null) return;
    const delay = started + GENERATION_TIMEOUT_MS - Date.now();
    if (delay <= 0) return;
    const timer = window.setTimeout(() => setNowMs(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [shown, ownerCatalog]);

  const waiting = ownerSongTileState(shown, ownerCatalog, nowMs);
  if (!ownerCatalog && shown.audioReady === false && !shown.deletedAt) return null;
  if (waiting) {
    return (
      <UnavailableAudioRow
        songId={shown.id}
        title={shown.title}
        cover={visible.fields}
        emptyInitials={visible.initials}
        coverNotice={
          notice
            ? {
                songId: shown.id,
                message: notice.message,
                action: notice.action,
                buttonLabel: notice.buttonLabel,
              }
            : null
        }
        onCoverResolved={setStatusOverride}
        state={waiting}
        prompt={shown.createPrompt}
        lyrics={shown.createLyrics}
        artistId={shown.artistId}
        artistVersionId={shown.artistVersionId}
      />
    );
  }

  return (
    <article className="block rounded-[12px] bg-card">
      <PlayableArt
        songId={shown.id}
        title={shown.title}
        artistName={name || 'Artist'}
        artistId={shown.artistId}
        cover={visible.fields}
        emptyInitials={visible.initials}
        playback="visibility"
        durationSeconds={shown.duration}
        href={`/songs/${shown.id}`}
      />
      {notice ? (
        <div className={isCompact ? 'px-2 pt-2' : 'px-3 pt-2'}>
          <CoverModerationNotice
            songId={shown.id}
            message={notice.message}
            action={notice.action}
            buttonLabel={notice.buttonLabel}
            onResolved={setStatusOverride}
          />
        </div>
      ) : null}
      <div className={isCompact ? 'p-2' : 'p-3'}>
        <div className={showPrivate ? 'flex min-w-0 items-center gap-2' : undefined}>
          <Link href={`/songs/${shown.id}`} className={showPrivate ? 'block min-w-0' : 'block'}>
            <h3
              className={showPrivate ? 'truncate font-semibold' : 'font-semibold line-clamp-2'}
              style={{ fontSize: 14, lineHeight: '20px', color: 'var(--ink)' }}
              data-entity="track"
            >
              {shown.title}
            </h3>
          </Link>
          {showPrivate ? <PrivateSongTag /> : null}
        </div>
        {name || showTicker ? (
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            {name ? (
              <>
                <ArtistFace
                  name={name}
                  sources={artistFaceSources(photoUrl, songCoverCandidates(visible.fields))}
                  size="card"
                />
                <MaybeArtistLink
                  artistId={shown.artistId}
                  linkable={linkable}
                  className="min-w-0 truncate"
                  style={{ fontSize: 12, lineHeight: '16px', color: 'var(--mute)' }}
                  dataEntity="artist"
                >
                  {name}
                </MaybeArtistLink>
              </>
            ) : null}
            <CoinBadge ticker={ticker} iconSrc={coinIcon} />
          </div>
        ) : null}
        {coin ? <ArtistCoinRow artistId={shown.artistId} quote={coin} linkable={linkable} /> : null}
      </div>
    </article>
  );
}
