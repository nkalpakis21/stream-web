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
      className={`flex items-center gap-2 px-4 py-2 rounded-full border border-border hover:bg-muted hover:border-accent/20 text-muted-foreground hover:text-foreground transition-all duration-200 ${className}`}
      aria-label="Buy on pump.fun"
    >
      <span className="text-sm font-medium">Buy</span>
    </a>
  );
}
