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
  size?: 'index' | 'card' | 'row' | 'hero';
}) {
  const [index, setIndex] = useState(0);
  const src = sources[index] ?? null;
  const hero = size === 'hero';
  const sizeClass =
    size === 'card'
      ? 'artist-face-card'
      : size === 'row'
        ? 'artist-face-row'
        : hero
          ? 'artist-face-hero'
          : '';
  // Hero initials wait until every source fails. Song rows keep the disc under the image.
  const showInitials = hero ? !src : true;

  return (
    <span
      className={`artist-index-face ${sizeClass}`.trim()}
      style={hero ? { background: '#14141C' } : undefined}
    >
      {showInitials ? (
        <span
          className="artist-index-face-initials"
          style={hero ? { background: '#14141C', color: '#F5F4F8' } : undefined}
          aria-hidden
        >
          {getInitials(name)}
        </span>
      ) : null}
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
