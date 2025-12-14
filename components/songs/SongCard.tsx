import Link from 'next/link';
import type { SongDocument } from '@/types/firestore';
import { formatDistanceToNow } from 'date-fns';

interface SongCardProps {
  song: SongDocument;
}

export function SongCard({ song }: SongCardProps) {
  const timeAgo = formatDistanceToNow(song.createdAt.toDate(), {
    addSuffix: true,
  });

  return (
    <Link
      href={`/songs/${song.id}`}
      className="block p-6 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
    >
      <h3 className="text-xl font-semibold mb-2">{song.title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Created {timeAgo}
      </p>
      {song.collaborationType && (
        <span className="inline-block mt-2 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
          {song.collaborationType}
        </span>
      )}
    </Link>
  );
}

