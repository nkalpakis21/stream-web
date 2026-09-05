'use client';

import Link from 'next/link';
import type { SongDocument } from '@/types/firestore';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import { PlayableArt } from '@/components/songs/PlayableArt';
import { CoinBadge } from '@/components/songs/CoinBadge';
import { DiscoverCoinRow } from '@/components/discover/DiscoverCoinRow';
import { coverFieldsFromSong } from '@/lib/covers/resolve';

interface DiscoverSongCardProps {
  song: SongDocument;
  artistName?: string;
  coin?: ArtistCoinQuote | null;
  hasCoin?: boolean;
}

export function DiscoverSongCard({
  song,
  artistName,
  coin = null,
  hasCoin = false,
}: DiscoverSongCardProps) {
  return (
    <article className="block rounded-[12px] bg-card">
      <PlayableArt
        songId={song.id}
        title={song.title}
        artistName={artistName || 'Artist'}
        artistId={song.artistId}
        cover={coverFieldsFromSong(song)}
        playback="visibility"
        durationSeconds={song.duration}
        href={`/songs/${song.id}`}
      />
      <div className="p-3">
        <Link href={`/songs/${song.id}`} className="block">
          <h3
            className="font-semibold line-clamp-2"
            style={{ fontSize: 14, lineHeight: '20px', color: 'var(--ink)' }}
            data-entity="track"
          >
            {song.title}
          </h3>
        </Link>
        {artistName || hasCoin ? (
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            {artistName ? (
              <p
                className="min-w-0 truncate"
                style={{ fontSize: 12, lineHeight: '16px', color: 'var(--mute)' }}
                data-entity="artist"
              >
                {artistName}
              </p>
            ) : null}
            {hasCoin ? <CoinBadge /> : null}
          </div>
        ) : null}
        <DiscoverCoinRow artistId={song.artistId} quote={coin} />
      </div>
    </article>
  );
}
