'use client';

import Link from 'next/link';
import type { SongDocument } from '@/types/firestore';
import { PlayableArt } from '@/components/songs/PlayableArt';

interface SongCardProps {
  song: SongDocument;
  artistName?: string;
  variant?: 'default' | 'glass';
  size?: 'default' | 'compact';
  hasCoin?: boolean;
}

export function SongCard({ song, artistName, size = 'default', hasCoin = false }: SongCardProps) {
  const coverImageUrl = song.albumCoverThumbnail || song.albumCoverPath;
  const isCompact = size === 'compact';

  return (
    <article className="block overflow-hidden rounded-xl bg-card">
      <PlayableArt
        songId={song.id}
        title={song.title}
        artistName={artistName || 'Artist'}
        coverUrl={coverImageUrl}
        hasCoin={hasCoin}
        href={`/songs/${song.id}`}
      />
      <div className={isCompact ? 'p-2' : 'p-3'}>
        <Link href={`/songs/${song.id}`} className="block">
          <h3 className={`font-semibold line-clamp-2 text-card-foreground ${isCompact ? 'text-xs' : 'text-sm'}`}>
            {song.title}
          </h3>
          {artistName && (
            <p className={`mt-0.5 line-clamp-1 text-muted-foreground ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
              {artistName}
            </p>
          )}
        </Link>
      </div>
    </article>
  );
}
