'use client';

import { useId } from 'react';
import { useRouter } from 'next/navigation';
import { TakePicker } from '@/components/songs/TakePicker';
import { useTakeSeed } from '@/components/songs/useTakeSeed';
import { buildTakeSlots, shouldShowTakePicker, type TakeSeed } from '@/lib/songs/takes';

interface SongTakesPanelProps {
  songId: string;
  initial: TakeSeed;
}

/** Song-ready screen for the owner. Leaving without a pick keeps Take 1. */
export function SongTakesPanel({ songId, initial }: SongTakesPanelProps) {
  const router = useRouter();
  const titleId = useId();
  const seed = useTakeSeed(songId, initial, true) ?? initial;
  if (!shouldShowTakePicker(buildTakeSlots(seed))) return null;
  return (
    <div className="mb-8">
      <TakePicker
        songId={songId}
        seed={seed}
        titleId={titleId}
        onSwitched={() => router.refresh()}
      />
    </div>
  );
}
