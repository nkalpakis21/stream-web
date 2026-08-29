import {
  coinChangeTone,
  formatChange24h,
  formatCoinHolders,
  formatCoinMcap,
  formatCoinPrice,
  formatCoinVolume,
  type ArtistCoinQuote,
} from '@/lib/brand/coinStats';

interface ArtistCoinModuleProps {
  quote: ArtistCoinQuote;
  buyUrl?: string | null;
}

function CoinSparkline({ points, tone }: { points: number[]; tone: 'up' | 'down' | 'flat' }) {
  if (points.length < 2) return null;

  const width = 48;
  const height = 16;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * (width - 2) + 1;
      const y = height - 1 - ((value - min) / span) * (height - 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      className={`coin-spark is-${tone}`}
      width={48}
      height={16}
      viewBox="0 0 48 16"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords}
      />
    </svg>
  );
}

export function ArtistCoinModule({ quote, buyUrl }: ArtistCoinModuleProps) {
  const price = formatCoinPrice(quote.priceUsd);
  const change = formatChange24h(quote.change24h);
  const mcap = formatCoinMcap(quote.marketCap);
  const volume =
    quote.volume24h != null ? formatCoinVolume(quote.volume24h) : '';
  const holders = quote.holders != null ? formatCoinHolders(quote.holders) : '';
  const tone = coinChangeTone(quote.change24h);
  const sparkline = quote.sparkline && quote.sparkline.length >= 2 ? quote.sparkline : null;

  if (!price || !change || !mcap) return null;

  const stats: { label: string; value: string }[] = [
    { label: 'Market cap', value: mcap },
  ];
  if (volume) stats.push({ label: '24h vol', value: volume });
  if (holders) stats.push({ label: 'Holders', value: holders });

  return (
    <aside className="coin-module">
      <p className="px">{price}</p>
      <div className="coin-chg-row">
        <span className={`chg is-${tone}`}>{change}</span>
        {sparkline ? <CoinSparkline points={sparkline} tone={tone} /> : null}
      </div>
      <dl className="coin-stats">
        {stats.map(stat => (
          <div key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
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
    </aside>
  );
}
