'use client';

import Link from 'next/link';
import { CoverImage } from '@/components/media/CoverImage';
import { coinChangeTone, type ArtistCoinQuote } from '@/lib/brand/coinStats';
import { formatHoldingChange, formatHoldingValue } from '@/lib/brand/bagStats';

export interface BagHolding {
  artistId: string;
  name: string;
  avatarURL: string | null;
  ticker: string | null;
  mint: string;
  buyUrl: string | null;
  quote: ArtistCoinQuote | null;
}

export function BagHoldingRow({ holding }: { holding: BagHolding }) {
  const value = formatHoldingValue(holding.quote);
  const change = formatHoldingChange(holding.quote);
  const tone = holding.quote
    ? coinChangeTone(holding.quote.change24h)
    : 'flat';
  const ticker = holding.ticker?.trim() || '';

  return (
    <Link
      href={`/artists/${holding.artistId}`}
      className="bag-holding"
    >
      <span className="bag-holding-face">
        <CoverImage
          src={holding.avatarURL}
          title={holding.name}
          sizes="40px"
          rounded="rounded-full"
        />
      </span>
      <span className="bag-holding-meta">
        <span className="bag-holding-name" data-entity="artist">
          {holding.name}
        </span>
        {ticker ? <span className="bag-holding-qty">{ticker}</span> : null}
      </span>
      <span className="bag-holding-stats">
        <span className="val">{value}</span>
        <span className={`chg is-${tone}`}>{change}</span>
      </span>
    </Link>
  );
}
