'use client';

import { getInitials } from '@/lib/utils/avatar';

export type ArtistPick = {
  id: string;
  name: string;
  avatarURL?: string | null;
};

/** Song create picks an artist by name and face. A list of rows, not a menu. */
export function ArtistPickList({
  artists,
  selectedId,
  onSelect,
  disabled = false,
}: {
  artists: readonly ArtistPick[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div role="listbox" aria-label="Artist" data-artist-picker className="flex flex-col gap-2">
      {artists.map(artist => {
        const selected = artist.id === selectedId;
        const face = artist.avatarURL?.trim() || '';
        return (
          <button
            key={artist.id}
            type="button"
            role="option"
            aria-selected={selected}
            data-artist-id={artist.id}
            disabled={disabled}
            onClick={() => onSelect(artist.id)}
            className="flex min-h-12 w-full items-center gap-3 rounded-[12px] border border-transparent px-3 py-2 text-left disabled:opacity-40"
            style={{ background: selected ? '#2A2A38' : 'transparent' }}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1C1C28] text-xs font-semibold text-[#E8E6F2]">
              {face ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={face} alt="" className="h-full w-full object-cover" />
              ) : (
                getInitials(artist.name)
              )}
            </span>
            <span className="min-w-0 truncate text-sm font-medium text-[#F5F4F8]">{artist.name}</span>
          </button>
        );
      })}
    </div>
  );
}
