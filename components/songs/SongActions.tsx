'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import type { SongDocument } from '@/types/firestore';
import Link from 'next/link';

interface SongActionsProps {
  song: SongDocument;
}

export function SongActions({ song }: SongActionsProps) {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Sign in to fork or remix this song
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      <Link
        href={`/songs/${song.id}/fork`}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Fork
      </Link>
      <Link
        href={`/songs/${song.id}/remix`}
        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
      >
        Remix
      </Link>
    </div>
  );
}

