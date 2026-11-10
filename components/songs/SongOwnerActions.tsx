'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { ChangeVoice } from '@/components/songs/ChangeVoice';
import type { VoiceGenerationRef, VoiceVersionRef } from '@/lib/songs/voiceChange';
import { DeleteSongButton } from './DeleteSongButton';

interface SongOwnerActionsProps {
  songId: string;
  songTitle: string;
  ownerId: string;
  artistVoice?: string | null;
  song: {
    path?: string | null;
    currentVersionId?: string | null;
    createOptions?: { instrumental?: boolean; voice?: string | null } | null;
    beatFirst?: { stage?: string | null; chosenVersionId?: string | null } | null;
    voiceChange?: {
      used?: number | null;
      status?: string | null;
      voice?: string | null;
      generationId?: string | null;
      originalVersionId?: string | null;
      sourceVersionId?: string | null;
    } | null;
  };
  versions: VoiceVersionRef[];
  generations: VoiceGenerationRef[];
}

export function SongOwnerActions({
  songId,
  songTitle,
  ownerId,
  artistVoice = null,
  song,
  versions,
  generations,
}: SongOwnerActionsProps) {
  const { user } = useAuth();

  if (!user || user.uid !== ownerId) {
    return null;
  }

  return (
    <ChangeVoice
      songId={songId}
      ownerId={ownerId}
      artistVoice={artistVoice}
      song={song}
      versions={versions}
      generations={generations}
      companion={<DeleteSongButton songId={songId} songTitle={songTitle} />}
    />
  );
}
