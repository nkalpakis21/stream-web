import Link from 'next/link';
import { formatCoinCluster, type ArtistCoinQuote } from '@/lib/brand/coinStats';

const EMPTY_PRICE = '$0';
const EMPTY_CHANGE = '0%';
const EMPTY_MCAP = '$0';

/**
 * Song-stage FOMO cluster. Always paints PRICE · 24H · MCAP.
 * Live Heat numbers when the artist quote is complete; otherwise
 * `$0` / `0%` / `$0` — never a fake live-looking price.
 * Buy only when a launched coin exists. No sparkline, vol, or holders.
 */
export function SongCoinCluster({
  artistId,
  quote,
  buyUrl,
}: {
  artistId: string | null;
  quote: ArtistCoinQuote | null;
  buyUrl?: string | null;
}) {
  const live = quote ? formatCoinCluster(quote) : null;
  const hasLive = Boolean(live && live.price && live.change && live.mcap);
  const price = hasLive && live ? live.price : EMPTY_PRICE;
  const change = hasLive && live ? live.change : EMPTY_CHANGE;
  const mcap = hasLive && live ? live.mcap : EMPTY_MCAP;
  const tone = hasLive && live ? live.tone : 'flat';

  const meta = (
    <>
      {price}
      {' · '}
      <span className={`is-${tone}`}>{change}</span>
      {' · '}
      {mcap}
    </>
  );

  return (
    <div className="song-stage-cluster">
      {artistId ? (
        <Link href={`/artists/${artistId}`} className="song-stage-cluster-meta">
          {meta}
        </Link>
      ) : (
        <span className="song-stage-cluster-meta">{meta}</span>
      )}
      {buyUrl ? (
        <a
          href={buyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-heat"
          aria-label="Buy coin"
        >
          Buy
        </a>
      ) : null}
    </div>
  );
}
