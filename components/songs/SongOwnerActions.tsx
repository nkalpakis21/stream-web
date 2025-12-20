'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { DeleteSongButton } from './DeleteSongButton';

interface SongOwnerActionsProps {
  songId: string;
  songTitle: string;
  ownerId: string;
}

export function SongOwnerActions({
  songId,
  songTitle,
  ownerId,
}: SongOwnerActionsProps) {
  const { user } = useAuth();

  // Only show delete button if user is the owner
  if (!user || user.uid !== ownerId) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 mt-4">
      <DeleteSongButton songId={songId} songTitle={songTitle} />
    </div>
  );
}

