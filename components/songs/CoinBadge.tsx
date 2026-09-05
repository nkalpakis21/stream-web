'use client';

import { useState } from 'react';

/** Soft 12px chip for song meta — never a stadium pill, never on cover art. */
export function CoinBadge({
  ticker,
  iconSrc,
}: {
  ticker?: string | null;
  iconSrc?: string | null;
}) {
  const label = ticker?.trim();
  if (!label) return null;

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-[12px] px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary"
      style={{ background: 'var(--surface-2, #1C1C28)' }}
    >
      <CoinMark src={iconSrc} />
      {label}
    </span>
  );
}

function CoinMark({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 12px mark; look URL is the coin image
      <img
        src={src as string}
        alt=""
        width={12}
        height={12}
        className="h-3 w-3 rounded-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }

  return <NeutralCoinGlyph />;
}

function NeutralCoinGlyph() {
  return (
    <svg
      viewBox="0 0 12 12"
      width={12}
      height={12}
      className="h-3 w-3"
      aria-hidden
    >
      <circle
        cx="6"
        cy="6"
        r="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <circle cx="6" cy="6" r="2" fill="currentColor" opacity="0.4" />
    </svg>
  );
}
