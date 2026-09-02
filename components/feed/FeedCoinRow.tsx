'use client';

import Link from 'next/link';
import { CoverImage } from '@/components/media/CoverImage';
import { formatHeatCoinCluster, type ArtistCoinQuote } from '@/lib/brand/coinStats';

export function FeedCoinRow({
  artistId,
  name,
  avatarURL,
  quote,
  buyUrl,
}: {
  artistId: string;
  name: string;
  avatarURL: string | null;
  quote: ArtistCoinQuote | null;
  buyUrl?: string | null;
}) {
  const { price, change, mcap, tone } = formatHeatCoinCluster(quote);
  const changeColor =
    tone === 'down' ? 'var(--down)' : tone === 'up' ? 'var(--heat)' : 'var(--mute)';

  return (
    <article className="flex items-center gap-3 rounded-[12px] bg-card px-3 py-3">
      <Link
        href={`/artists/${artistId}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full">
          <CoverImage
            src={avatarURL}
            title={name}
            sizes="40px"
            rounded="rounded-full"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-sm font-medium"
            style={{ color: 'var(--ink)' }}
            data-entity="artist"
          >
            {name}
          </span>
          <span
            className="mt-0.5 block truncate text-xs font-medium tabular-nums"
            style={{ lineHeight: '16px' }}
          >
            <span style={{ color: 'var(--ink)' }}>{price}</span>
            <span style={{ color: 'var(--mute)' }}> · </span>
            <span style={{ color: changeColor }}>{change}</span>
            <span style={{ color: 'var(--mute)' }}> · </span>
            <span style={{ color: 'var(--mute)' }}>{mcap}</span>
          </span>
        </span>
      </Link>
      {buyUrl ? (
        <a
          href={buyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="listen-btn-buy shrink-0 !h-10 !px-4"
          aria-label={`Buy coin, ${name}`}
        >
          Buy
        </a>
      ) : null}
    </article>
  );
}

export function FeedCoinRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-[12px] bg-card px-3 py-3 animate-pulse">
      <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-28 rounded bg-muted" />
        <div className="h-3 w-40 rounded bg-muted" />
      </div>
      <div className="h-10 w-16 rounded-[12px] bg-muted" />
    </div>
  );
}
