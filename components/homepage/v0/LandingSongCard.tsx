'use client';

import { useState } from 'react';
import { Play, Music } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { SongDocument } from '@/types/firestore';
import { formatDistanceToNow } from 'date-fns';

// Firestore Timestamp gets serialized when passed from server to client - handle both
function toDate(value: { toDate?: () => Date; seconds?: number } | Date): Date {
  if (value instanceof Date) return value;
  if ('toDate' in value && typeof value.toDate === 'function') return value.toDate();
  const ts = value as { seconds: number };
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  return new Date();
}

interface LandingSongCardProps {
  song: SongDocument;
  artistName?: string;
}

export function LandingSongCard({ song, artistName }: LandingSongCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const coverImageUrl = song.albumCoverThumbnail || song.albumCoverPath;
  const timeAgo = formatDistanceToNow(toDate(song.createdAt as object), { addSuffix: true });
  const playCount = song.playCount ?? 0;

  return (
    <Link
      href={`/songs/${song.id}`}
      className="group relative flex flex-col gap-3 cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Cover Art */}
      <div className="relative aspect-square rounded-xl overflow-hidden bg-secondary">
        {coverImageUrl ? (
          <Image
            src={coverImageUrl}
            alt={`Cover art for ${song.title}`}
            fill
            unoptimized={true}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Music className="w-12 h-12 text-muted-foreground/40" />
          </div>
        )}

        {/* Hover overlay */}
        <div
          className={`absolute inset-0 bg-background/40 flex items-center justify-center transition-opacity duration-300 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
            <Play className="w-6 h-6 text-primary-foreground ml-0.5" fill="currentColor" />
          </div>
        </div>

        {/* Play count badge */}
        <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-background/70 backdrop-blur-md text-xs font-medium text-foreground">
          <Music className="w-3 h-3" />
          {playCount.toLocaleString()}
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-col gap-0.5 px-1">
        <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
          {song.title}
        </h3>
        {artistName && (
          <p className="text-xs text-muted-foreground truncate">{artistName}</p>
        )}
        <p className="text-xs text-muted-foreground/60">{timeAgo}</p>
      </div>
    </Link>
  );
}
