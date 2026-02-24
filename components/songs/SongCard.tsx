import Link from 'next/link';
import Image from 'next/image';
import type { SongDocument } from '@/types/firestore';
import { formatDistanceToNow } from 'date-fns';

interface SongCardProps {
  song: SongDocument;
  artistName?: string;
  variant?: 'default' | 'glass';
  size?: 'default' | 'compact';
}

export function SongCard({ song, artistName, variant = 'default', size = 'default' }: SongCardProps) {
  const isCompact = size === 'compact';
  const timeAgo = formatDistanceToNow(song.createdAt.toDate(), {
    addSuffix: true,
  });

  const coverImageUrl = song.albumCoverThumbnail || song.albumCoverPath;

  const cardClass =
    variant === 'glass'
      ? `group block overflow-hidden border border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition-all duration-300 ${isCompact ? 'rounded-lg' : 'rounded-xl'}`
      : 'group block bg-card rounded-xl overflow-hidden shadow-soft hover:shadow-medium transition-all duration-300 card-hover';

  return (
    <Link href={`/songs/${song.id}`} className={cardClass}>
      <div className="relative w-full aspect-square bg-muted overflow-hidden">
        {coverImageUrl ? (
          <>
            <Image
              src={coverImageUrl}
              alt={song.title}
              fill
              unoptimized={true}
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
            {/* Multi-layer overlay for polish */}
            <div className="absolute inset-0 bg-gradient-to-br from-black/5 via-transparent to-black/15 pointer-events-none" />
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{ 
                background: 'radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.25) 100%)' 
              }}
            />
            <div className="absolute inset-0 bg-accent/3 mix-blend-soft-light pointer-events-none" />
          </>
        ) : (
          <div
            className={
              variant === 'glass'
                ? 'w-full h-full flex items-center justify-center bg-white/10'
                : 'w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50'
            }
          >
            <svg
              className={
                variant === 'glass'
                  ? isCompact ? 'w-8 h-8 text-white/40' : 'w-12 h-12 text-white/40'
                  : isCompact ? 'w-8 h-8 text-muted-foreground/40' : 'w-12 h-12 text-muted-foreground/40'
              }
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        {/* Play Count Overlay */}
        <div className={`absolute bg-black/70 backdrop-blur-sm rounded-full flex items-center gap-1 ${isCompact ? 'top-1 right-1 px-1.5 py-0.5' : 'top-2 right-2 px-2 py-1'}`}>
          <svg className={isCompact ? 'w-2.5 h-2.5 text-white' : 'w-3 h-3 text-white'} fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
          <span className={`font-medium text-white ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>
            {(song.playCount ?? 0).toLocaleString()}
          </span>
        </div>
      </div>
      <div className={isCompact ? 'p-2' : 'p-3'}>
        <h3
          className={
            variant === 'glass'
              ? `font-semibold line-clamp-2 text-white group-hover:text-white/90 transition-colors ${isCompact ? 'text-xs mb-0.5' : 'text-sm mb-1'}`
              : `font-semibold line-clamp-2 text-card-foreground group-hover:text-accent transition-colors ${isCompact ? 'text-xs mb-0.5' : 'text-sm mb-1'}`
          }
        >
          {song.title}
        </h3>
        {artistName && (
          <p
            className={
              variant === 'glass'
                ? `text-white/70 line-clamp-1 ${isCompact ? 'text-[10px] mb-0.5' : 'text-xs mb-1'}`
                : `text-muted-foreground/70 line-clamp-1 ${isCompact ? 'text-[10px] mb-0.5' : 'text-xs mb-1'}`
            }
          >
            {artistName}
          </p>
        )}
        <p
          className={
            variant === 'glass'
              ? `text-white/60 ${isCompact ? 'text-[10px]' : 'text-xs'}`
              : `text-muted-foreground ${isCompact ? 'text-[10px]' : 'text-xs'}`
          }
        >
          {timeAgo}
        </p>
      </div>
    </Link>
  );
}

