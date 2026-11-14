'use client';

import { useEffect, useRef, useState } from 'react';
import { currentFaceSrc, failFaceSrc } from '@/lib/images/artistFace';
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
  const loadedRef = useRef<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  loadedRef.current = loaded;
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

  const settleRef = useRef<(img: HTMLImageElement) => void>(() => {});
  settleRef.current = img => {
    // A still-loading image is complete === false. Only a finished load with
    // no pixels is a failure — the same signal the browser leaves behind when
    // the src errored before hydration, so React's onError never ran.
    const url = img.getAttribute('src');
    if (!url || url === loadedRef.current || img.naturalWidth > 0 || !img.complete) return;
    setFailed(current => {
      const next = failFaceSrc(sources, current, url, loadedRef.current).failed;
      if (next.length === current.length && next.every((item, index) => item === current[index])) {
        return current;
      }
      return next;
    });
  };

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    settleRef.current(img);
  }, [src]);

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
        // eslint-disable-next-line @next/next/no-img-element -- plain img, no crossOrigin: S3 does not send CORS on a no-cors image fetch
        <img
          key={src}
          ref={imgRef}
          src={src}
          alt={name}
          width={96}
          height={96}
          className="artist-index-face-img"
          onLoad={event => {
            const img = event.currentTarget;
            const url = img.getAttribute('src');
            if (!url || img.naturalWidth === 0) return;
            setLoaded(url);
            setFailed(current => (current.includes(url) ? current.filter(item => item !== url) : current));
          }}
          onError={event => {
            const img = event.currentTarget;
            if (img.complete) {
              settleRef.current(img);
              return;
            }
            // The error can beat the complete flag. Recheck once the load has settled.
            window.requestAnimationFrame(() => {
              if (img.isConnected) settleRef.current(img);
            });
          }}
        />
      ) : null}
    </span>
  );
}
