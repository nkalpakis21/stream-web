'use client';

import { useEffect, useState } from 'react';
import { formatHeatCoinCluster, type ArtistCoinQuote } from '@/lib/brand/coinStats';
import { MaybeArtistLink } from '@/components/songs/MaybeArtistLink';

interface CoinQuoteResponse {
  quote?: ArtistCoinQuote | null;
  linkable?: boolean;
}

/** Persistent player chip. Always paints PRICE / 24H / mcap-if-fits, including $0 / 0% / $0. */
export function PlayerCoinChip({ artistId }: { artistId?: string }) {
  const [quote, setQuote] = useState<ArtistCoinQuote | null>(null);
  const [linkable, setLinkable] = useState(false);

  useEffect(() => {
    if (!artistId) {
      setQuote(null);
      setLinkable(false);
      return;
    }

    let cancelled = false;
    setQuote(null);
    setLinkable(false);

    fetch(`/api/artists/${encodeURIComponent(artistId)}/coin-quote`)
      .then(res => (res.ok ? (res.json() as Promise<CoinQuoteResponse>) : { quote: null, linkable: false }))
      .then(data => {
        if (!cancelled) {
          setQuote(data.quote ?? null);
          setLinkable(data.linkable === true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQuote(null);
          setLinkable(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [artistId]);

  if (!artistId) return null;

  const { price, change, mcap, tone } = formatHeatCoinCluster(quote);

  return (
    <MaybeArtistLink
      artistId={artistId}
      linkable={linkable}
      className="listen-player-chip"
    >
      <span className="listen-player-chip-price" aria-label={`${price} ${change}`}>{price}</span>
      <span className={`listen-player-chip-chg is-${tone}`}>{change}</span>
      <span className="listen-player-chip-mcap">{mcap}</span>
    </MaybeArtistLink>
  );
}
