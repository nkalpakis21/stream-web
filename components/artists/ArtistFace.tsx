'use client';

import { useState } from 'react';
import { currentFaceSrc } from '@/lib/images/artistFace';
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
  const [failed, setFailed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<string | null>(null);
  const src = currentFaceSrc(sources, failed, loaded);
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
        // eslint-disable-next-line @next/next/no-img-element -- the first src is in the server HTML and onError walks the rest
        <img
          src={src}
          alt={name}
          width={96}
          height={96}
          className="artist-index-face-img"
          onLoad={event => {
            const url = event.currentTarget.getAttribute('src');
            if (!url) return;
            setLoaded(url);
            setFailed(current => (current.includes(url) ? current.filter(item => item !== url) : current));
          }}
          onError={event => {
            const img = event.currentTarget;
            const url = img.getAttribute('src');
            if (!url || url === loaded || img.naturalWidth > 0) return;
            window.setTimeout(() => {
              if (!img.isConnected || img.getAttribute('src') !== url) return;
              if (img.naturalWidth > 0) {
                setLoaded(url);
                return;
              }
              setFailed(current => (current.includes(url) ? current : [...current, url]));
            }, 0);
          }}
        />
      ) : null}
    </span>
  );
}
