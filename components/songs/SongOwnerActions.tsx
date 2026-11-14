'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { ChangeVoice } from '@/components/songs/ChangeVoice';
import type { VoiceGenerationRef, VoiceVersionRef } from '@/lib/songs/voiceChange';
import type { PublicStreamstarVoice } from '@/lib/voices/streamstarVoices';
import { DeleteSongButton } from './DeleteSongButton';

interface SongOwnerActionsProps {
  songId: string;
  songTitle: string;
  ownerId: string;
  artistVoice?: string | null;
  voices?: readonly PublicStreamstarVoice[];
  songVoiceSlug?: string | null;
  song: {
    path?: string | null;
    currentVersionId?: string | null;
    audioReady?: boolean | null;
    duration?: number | null;
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
  voices = [],
  songVoiceSlug = null,
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
      voices={voices}
      songVoiceSlug={songVoiceSlug}
      song={song}
      versions={versions}
      generations={generations}
      companion={<DeleteSongButton songId={songId} songTitle={songTitle} />}
    />
  );
}
