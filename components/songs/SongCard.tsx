'use client';

import Link from 'next/link';
import type { SongDocument } from '@/types/firestore';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import { PlayableArt } from '@/components/songs/PlayableArt';
import { ArtistCoinRow } from '@/components/songs/ArtistCoinRow';
import { coverFieldsFromSong } from '@/lib/covers/resolve';

interface SongCardProps {
  song: SongDocument;
  artistName?: string;
  variant?: 'default' | 'glass';
  size?: 'default' | 'compact';
  hasCoin?: boolean;
  coin?: ArtistCoinQuote | null;
}

export function SongCard({
  song,
  artistName,
  size = 'default',
  hasCoin = false,
  coin = null,
}: SongCardProps) {
  const isCompact = size === 'compact';
  const showMetrics = Boolean(coin);

  return (
    <article className="block rounded-[12px] bg-card">
      <PlayableArt
        songId={song.id}
        title={song.title}
        artistName={artistName || 'Artist'}
        artistId={song.artistId}
        cover={coverFieldsFromSong(song)}
        playback="visibility"
        hasCoin={showMetrics ? false : hasCoin}
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
        {artistName ? (
          <p
            className="mt-0.5 line-clamp-1"
            style={{ fontSize: 12, lineHeight: '16px', color: 'var(--mute)' }}
            data-entity="artist"
          >
            {artistName}
          </p>
        ) : null}
        {coin ? <ArtistCoinRow artistId={song.artistId} quote={coin} /> : null}
      </div>
    </article>
  );
}
