'use client';

import { HEAR_BEAT_FIRST_HINT, HEAR_BEAT_FIRST_LABEL, showHearBeatFirst } from '@/lib/songs/beatFirst';

/**
 * Ice text link above Create. Hidden for the first-artist flow and when
 * Just the beat is on. The caller passes firstArtist false from Studio.
 */
export function HearBeatFirstLink({
  instrumental,
  firstArtist = false,
  disabled,
  onClick,
}: {
  instrumental: boolean;
  firstArtist?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  if (!showHearBeatFirst({ firstArtist, instrumental })) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1" data-hear-beat-first>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-[#E8E6F2] disabled:opacity-40"
      >
        {HEAR_BEAT_FIRST_LABEL}
      </button>
      <span className="text-sm text-[#8B8896]">{HEAR_BEAT_FIRST_HINT}</span>
    </div>
  );
}
