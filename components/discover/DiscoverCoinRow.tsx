import { formatHeatCoinCluster, type ArtistCoinQuote } from '@/lib/brand/coinStats';
import { MaybeArtistLink } from '@/components/songs/MaybeArtistLink';

/** Discover / New cards. Always paints PRICE / 24H / MCAP, including $0 / 0% / $0. */
export function DiscoverCoinRow({
  artistId,
  quote,
  linkable = true,
}: {
  artistId: string;
  quote: ArtistCoinQuote | null;
  linkable?: boolean;
}) {
  const { price, change, mcap, tone } = formatHeatCoinCluster(quote);
  const changeColor =
    tone === 'down' ? 'var(--down)' : tone === 'up' ? 'var(--heat)' : 'var(--mute)';

  return (
    <MaybeArtistLink
      artistId={artistId}
      linkable={linkable}
      className="mt-1 block font-medium tabular-nums"
      style={{ fontSize: 12, lineHeight: '16px' }}
    >
      <span style={{ color: 'var(--ink)' }}>{price}</span>
      <span style={{ color: 'var(--mute)' }}> · </span>
      <span style={{ color: changeColor }}>{change}</span>
      <span style={{ color: 'var(--mute)' }}> · mcap {mcap}</span>
    </MaybeArtistLink>
  );
}
