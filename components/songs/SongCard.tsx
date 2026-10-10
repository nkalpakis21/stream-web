'use client';

import Link from 'next/link';
import type { SongDocument } from '@/types/firestore';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import { PlayableArt } from '@/components/songs/PlayableArt';
import { CoinBadge } from '@/components/songs/CoinBadge';
import { ArtistCoinRow } from '@/components/songs/ArtistCoinRow';
import { ArtistFace } from '@/components/artists/ArtistFace';
import { MaybeArtistLink } from '@/components/songs/MaybeArtistLink';
import { coverFieldsFromSong } from '@/lib/covers/resolve';
import { artistFaceSources, songCoverCandidates } from '@/lib/images/artistFace';
import type { ArtistCardDisplay } from '@/lib/artists/cardDisplay';

interface SongCardProps {
  song: SongDocument;
  artistName?: string;
  artist?: ArtistCardDisplay | null;
  variant?: 'default' | 'glass';
  size?: 'default' | 'compact';
  ticker?: string | null;
  coinIcon?: string | null;
  coin?: ArtistCoinQuote | null;
}

export function SongCard({
  song,
  artistName,
  artist = null,
  size = 'default',
  ticker = null,
  coinIcon = null,
  coin = null,
}: SongCardProps) {
  const isCompact = size === 'compact';
  const showTicker = Boolean(ticker?.trim());
  const name = artist?.name || artistName;
  const linkable = artist?.isPublic === true;
  const photoUrl = artist?.photoUrl ?? null;

  return (
    <article className="block rounded-[12px] bg-card">
      <PlayableArt
        songId={song.id}
        title={song.title}
        artistName={name || 'Artist'}
        artistId={song.artistId}
        cover={coverFieldsFromSong(song)}
        playback="visibility"
        durationSeconds={song.duration}
        href={`/songs/${song.id}`}
      />
      <div className={isCompact ? 'p-2' : 'p-3'}>
        <Link href={`/songs/${song.id}`} className="block">
          <h3
            className="font-semibold line-clamp-2"
            style={{ fontSize: 14, lineHeight: '20px', color: 'var(--ink)' }}
            data-entity="track"
          >
            {song.title}
          </h3>
        </Link>
        {name || showTicker ? (
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            {name ? (
              <>
                <ArtistFace
                  name={name}
                  sources={artistFaceSources(photoUrl, songCoverCandidates(song))}
                  size="card"
                />
                <MaybeArtistLink
                  artistId={song.artistId}
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
        {coin ? <ArtistCoinRow artistId={song.artistId} quote={coin} linkable={linkable} /> : null}
      </div>
    </article>
  );
}
