import Link from 'next/link';
import { formatCoinCluster, type ArtistCoinQuote } from '@/lib/brand/coinStats';

export function ArtistCoinRow({
  artistId,
  quote,
}: {
  artistId: string;
  quote: ArtistCoinQuote;
}) {
  const { price, change, mcap, tone } = formatCoinCluster(quote);
  const changeColor =
    tone === 'down' ? 'var(--down)' : tone === 'up' ? 'var(--heat)' : 'var(--mute)';

  return (
    <Link
      href={`/artists/${artistId}`}
      className="mt-1 block font-medium tabular-nums"
      style={{ fontSize: 12, lineHeight: '16px' }}
    >
      <span style={{ color: 'var(--ink)' }}>{price}</span>
      <span style={{ color: 'var(--mute)' }}> · </span>
      <span style={{ color: changeColor }}>{change}</span>
      <span style={{ color: 'var(--mute)' }}> · mcap {mcap}</span>
    </Link>
  );
}
