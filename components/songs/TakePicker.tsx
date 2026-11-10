'use client';

import { useRef, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { getFreshIdToken, userFacingApiError } from '@/lib/api/clientAuth';
import { PickYourTake } from '@/components/songs/PickYourTake';
import { postSongTake } from '@/lib/songs/switchTakeClient';
import {
  SWITCH_TAKE_ERROR,
  buildTakeSlots,
  slotsWithCurrent,
  type TakeNumber,
  type TakeSeed,
  type TakeSlot,
} from '@/lib/songs/takes';

interface TakePickerProps {
  songId: string;
  seed: TakeSeed;
  titleId: string;
  onSwitched?: () => void;
}

export function TakePicker({ songId, seed, titleId, onSwitched }: TakePickerProps) {
  const { user } = useAuth();
  const openedAt = useRef(Date.now());
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [using, setUsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slots = slotsWithCurrent(buildTakeSlots(seed), pickedId);
  const currentTake = slots?.find((slot) => slot.isCurrent)?.take ?? 1;
  const [selected, setSelected] = useState<TakeNumber>(currentTake);

  if (!slots) return null;

  const useTake = (slot: TakeSlot) => {
    if (!slot.versionId || !user || using) return;
    setUsing(true);
    setError(null);
    const msToPick = Math.max(0, Date.now() - openedAt.current);
    void (async () => {
      try {
        const token = await getFreshIdToken(user);
        const result = await postSongTake({
          songId,
          versionId: slot.versionId as string,
          msToPick,
          token,
        });
        if (!result.ok) {
          setError(userFacingApiError(undefined, result.error, SWITCH_TAKE_ERROR));
          return;
        }
        setPickedId(slot.versionId);
        setSelected(slot.take);
        onSwitched?.();
      } catch (err) {
        setError(userFacingApiError(undefined, err, SWITCH_TAKE_ERROR));
      } finally {
        setUsing(false);
      }
    })();
  };

  return (
    <>
      <PickYourTake
        slots={slots}
        selected={selected}
        onSelect={setSelected}
        onUse={useTake}
        using={using}
        error={error}
        titleId={titleId}
      />
    </>
  );
}
