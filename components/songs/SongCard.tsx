import Link from 'next/link';
import Image from 'next/image';
import type { SongDocument } from '@/types/firestore';
import { formatDistanceToNow } from 'date-fns';

interface SongCardProps {
  song: SongDocument;
}

export function SongCard({ song }: SongCardProps) {
  const timeAgo = formatDistanceToNow(song.createdAt.toDate(), {
    addSuffix: true,
  });

  const coverImageUrl = song.albumCoverThumbnail || song.albumCoverPath;

  return (
    <Link
      href={`/songs/${song.id}`}
      className="group block bg-card rounded-2xl overflow-hidden shadow-soft hover:shadow-medium transition-all duration-300 card-hover"
    >
      <div className="relative w-full aspect-square bg-muted overflow-hidden">
        {coverImageUrl ? (
          <Image
            src={coverImageUrl}
            alt={song.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <svg
              className="w-12 h-12 text-muted-foreground/40"
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
        <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm rounded-full px-2.5 py-1.5 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
          <span className="text-xs font-medium text-white">
            {(song.playCount ?? 0).toLocaleString()}
          </span>
        </div>
      </div>
      <div className="p-5">
        <h3 className="text-lg font-semibold mb-1.5 line-clamp-2 text-card-foreground group-hover:text-accent transition-colors">
          {song.title}
        </h3>
        <p className="text-sm text-muted-foreground">
          {timeAgo}
        </p>
      </div>
    </Link>
  );
}

