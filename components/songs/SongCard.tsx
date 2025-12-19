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
      className="block border border-gray-200 dark:border-gray-800 rounded-lg hover:border-gray-300 dark:hover:border-gray-700 transition-colors overflow-hidden"
    >
      <div className="relative w-full aspect-square bg-gray-100 dark:bg-gray-800">
        {coverImageUrl ? (
          <Image
            src={coverImageUrl}
            alt={song.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800">
            <svg
              className="w-16 h-16 text-gray-400 dark:text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="text-xl font-semibold mb-1 line-clamp-2">{song.title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
          Created {timeAgo}
        </p>
        {song.collaborationType && (
          <span className="inline-block px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
            {song.collaborationType}
          </span>
        )}
      </div>
    </Link>
  );
}

