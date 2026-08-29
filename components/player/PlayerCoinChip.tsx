'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCoinCluster, type ArtistCoinQuote } from '@/lib/brand/coinStats';

interface CoinQuoteResponse {
  quote?: ArtistCoinQuote | null;
}

export function PlayerCoinChip({ artistId }: { artistId?: string }) {
  const [quote, setQuote] = useState<ArtistCoinQuote | null>(null);

  useEffect(() => {
    if (!artistId) {
      setQuote(null);
      return;
    }

    let cancelled = false;
    setQuote(null);

    fetch(`/api/artists/${encodeURIComponent(artistId)}/coin-quote`)
      .then(res => (res.ok ? (res.json() as Promise<CoinQuoteResponse>) : { quote: null }))
      .then(data => {
        if (!cancelled) setQuote(data.quote ?? null);
      })
      .catch(() => {
        if (!cancelled) setQuote(null);
      });

    return () => {
      cancelled = true;
    };
  }, [artistId]);

  if (!artistId || !quote) return null;

  const { price, change, mcap, tone } = formatCoinCluster(quote);

  return (
    <Link href={`/artists/${artistId}`} className="listen-player-chip" aria-label={`${price} ${change}`}>
      <span className="listen-player-chip-price">{price}</span>
      <span className={`listen-player-chip-chg is-${tone}`}>{change}</span>
      {mcap ? <span className="listen-player-chip-mcap">{mcap}</span> : null}
    </Link>
  );
}
