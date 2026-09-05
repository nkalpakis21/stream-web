'use client';

import { useState } from 'react';
import Image from 'next/image';
import { coverArtAlt } from '@/lib/brand/site';

export function CoverPlaceholder({
  className = '',
  rounded = 'rounded-cover',
}: {
  className?: string;
  rounded?: string;
}) {
  return (
    <span
      className={`absolute inset-0 block ${rounded} ${className}`}
      style={{
        background: 'var(--surface-2, #1C1C28)',
        boxShadow: 'inset 0 0 0 1px var(--line, #2A2A38)',
      }}
      aria-hidden
    />
  );
}

interface CoverImageProps {
  src: string | null | undefined;
  title: string;
  sizes: string;
  className?: string;
  rounded?: string;
  unoptimized?: boolean;
  priority?: boolean;
}

export function CoverImage({
  src,
  title,
  sizes,
  className = 'object-cover',
  rounded = 'rounded-cover',
  unoptimized = true,
  priority = false,
}: CoverImageProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <>
      {showImage ? (
        <Image
          src={src as string}
          alt={coverArtAlt(title)}
          fill
          className={`${className} ${rounded}`.trim()}
          sizes={sizes}
          unoptimized={unoptimized}
          priority={priority}
          onError={() => setFailed(true)}
        />
      ) : (
        <CoverPlaceholder rounded={rounded} />
      )}
    </>
  );
}
