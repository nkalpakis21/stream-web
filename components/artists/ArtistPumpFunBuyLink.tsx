'use client';

import type { PumpFunCoin } from '@/types/firestore';

interface ArtistPumpFunBuyLinkProps {
  pumpFun?: PumpFunCoin | null;
  className?: string;
}

/**
 * Fan-facing Buy link out to pump.fun. Hidden when the artist has no coin.
 * Does not show the mint address.
 */
export function ArtistPumpFunBuyLink({
  pumpFun,
  className = '',
}: ArtistPumpFunBuyLinkProps) {
  const url = pumpFun?.url?.trim();
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`listen-btn-buy ${className}`}
      aria-label="Buy on pump.fun"
    >
      Buy
    </a>
  );
}
