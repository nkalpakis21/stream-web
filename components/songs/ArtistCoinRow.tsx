import { formatCoinCluster, type ArtistCoinQuote } from '@/lib/brand/coinStats';
import { MaybeArtistLink } from '@/components/songs/MaybeArtistLink';

export function ArtistCoinRow({
  artistId,
  quote,
  linkable = true,
}: {
  artistId: string;
  quote: ArtistCoinQuote;
  linkable?: boolean;
}) {
  const { price, change, mcap, tone } = formatCoinCluster(quote);
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
