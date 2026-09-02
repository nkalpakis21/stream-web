'use client';

import Link from 'next/link';
import { CoverImage } from '@/components/media/CoverImage';
import { coinChangeTone, type ArtistCoinQuote } from '@/lib/brand/coinStats';
import {
  formatHoldingChange,
  formatHoldingValue,
  formatTokenAmount,
} from '@/lib/brand/bagStats';

export interface BagHolding {
  artistId: string;
  name: string;
  avatarURL: string | null;
  mint: string;
  buyUrl: string | null;
  amount: number;
  quote: ArtistCoinQuote | null;
}

export function BagHoldingRow({ holding }: { holding: BagHolding }) {
  const value = formatHoldingValue(holding.amount, holding.quote);
  const change = formatHoldingChange(holding.quote);
  const tone = holding.quote
    ? coinChangeTone(holding.quote.change24h)
    : 'flat';

  return (
    <article className="flex items-center gap-3 rounded-[12px] bg-card px-3 py-3">
      <Link
        href={`/artists/${holding.artistId}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full">
          <CoverImage
            src={holding.avatarURL}
            title={holding.name}
            sizes="40px"
            rounded="rounded-full"
          />
        </span>
        <span className="min-w-0">
          <span
            className="block truncate text-sm font-medium text-foreground"
            data-entity="artist"
          >
            {holding.name}
          </span>
          <span className="block text-xs tabular-nums text-muted-foreground">
            {formatTokenAmount(holding.amount)}
          </span>
        </span>
      </Link>
      <div className="shrink-0 text-right font-medium tabular-nums">
        <p className="text-sm" style={{ color: 'var(--ink)' }}>
          {value}
        </p>
        <p
          className={`text-xs is-${tone}`}
          style={{
            color:
              tone === 'down'
                ? 'var(--down)'
                : tone === 'up'
                  ? 'var(--heat)'
                  : 'var(--mute)',
          }}
        >
          {change}
        </p>
      </div>
      {holding.buyUrl ? (
        <a
          href={holding.buyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="listen-btn-buy shrink-0 !h-10 !px-4"
          aria-label={`Buy coin, ${holding.name}`}
        >
          Buy
        </a>
      ) : null}
    </article>
  );
}
