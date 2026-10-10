'use client';

import { useState } from 'react';
import { getInitials } from '@/lib/utils/avatar';
import './artist-card.css';

export function ArtistFace({
  name,
  sources,
  size = 'index',
}: {
  name: string;
  sources: string[];
  size?: 'index' | 'card' | 'row';
}) {
  const [index, setIndex] = useState(0);
  const src = sources[index] ?? null;
  const sizeClass =
    size === 'card' ? 'artist-face-card' : size === 'row' ? 'artist-face-row' : '';

  return (
    <span className={`artist-index-face ${sizeClass}`.trim()}>
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
