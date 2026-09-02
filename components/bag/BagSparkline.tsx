import { coinChangeTone, type CoinChangeTone } from '@/lib/brand/coinStats';
import type { BagTimeframe } from '@/lib/brand/bagStats';

const WIDTH = 320;
const HEIGHT = 140;
const PAD = 16;

function linePath(points: number[]): string {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  return points
    .map((value, index) => {
      const x = PAD + (index / (points.length - 1)) * (WIDTH - PAD * 2);
      const y = HEIGHT - PAD - ((value - min) / span) * (HEIGHT - PAD * 2);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function zeroPath(): string {
  const y = HEIGHT / 2;
  return `M${PAD} ${y} L${WIDTH - PAD} ${y}`;
}

export function BagSparkline({
  points,
  timeframe,
}: {
  points: number[] | null;
  timeframe: BagTimeframe;
}) {
  const real = points && points.length >= 2;
  const tone: CoinChangeTone = real
    ? coinChangeTone(points[points.length - 1] - points[0])
    : 'flat';
  const d = real ? linePath(points) : zeroPath();
  const label = real
    ? `Bag value over ${timeframe}`
    : 'Bag value, no history yet';

  return (
    <figure className="bag-chart" aria-label={label}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-hidden
      >
        <path
          className={`bag-chart-line ${real ? `is-${tone}` : 'is-zero'}`}
          d={d}
        />
      </svg>
    </figure>
  );
}
