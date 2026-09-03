'use client';

import { useState } from 'react';
import { getInitials } from '@/lib/utils/avatar';

export function ArtistFace({
  name,
  sources,
}: {
  name: string;
  sources: string[];
}) {
  const [index, setIndex] = useState(0);
  const src = sources[index] ?? null;

  return (
    <span className="artist-index-face">
      <span className="artist-index-face-initials" aria-hidden>
        {getInitials(name)}
      </span>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- onerror must advance the face fallback immediately
        <img
          key={src}
          src={src}
          alt={name}
          width={96}
          height={96}
          className="artist-index-face-img"
          onError={() => setIndex(current => current + 1)}
        />
      ) : null}
    </span>
  );
}
