'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { AuthGateCard } from '@/components/auth/AuthGateCard';
import {
  listenPrimaryClass,
  listenSecondaryClass,
} from '@/components/states/BrandDeadEnd';
import { coinChangeTone } from '@/lib/brand/coinStats';
import {
  BAG_TIMEFRAMES,
  bagTotals,
  bagValueSeries,
  formatBagHeader,
  type BagTimeframe,
} from '@/lib/brand/bagStats';
import { BagHoldingRow, type BagHolding } from '@/components/bag/BagHoldingRow';
import {
  BagHoldingSkeletonList,
  BagPageSkeleton,
} from '@/components/bag/BagHoldingSkeleton';
import { BagIdentity } from '@/components/bag/BagIdentity';
import { BagSparkline } from '@/components/bag/BagSparkline';
import { BagActivity } from '@/components/bag/BagActivity';
import '@/components/bag/bag.css';

function asHoldings(value: unknown): BagHolding[] {
  if (!Array.isArray(value)) return [];
  const out: BagHolding[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const holding = row as Partial<BagHolding>;
    if (typeof holding.artistId !== 'string' || typeof holding.mint !== 'string') {
      continue;
    }
    const ticker =
      typeof holding.ticker === 'string' ? holding.ticker.trim() : '';
    out.push({
      artistId: holding.artistId,
      name:
        typeof holding.name === 'string' && holding.name.trim()
          ? holding.name
          : 'Artist',
      avatarURL: holding.avatarURL ?? null,
      ticker: ticker || null,
      mint: holding.mint,
      buyUrl: holding.buyUrl ?? null,
      amount:
        typeof holding.amount === 'number' && Number.isFinite(holding.amount)
          ? holding.amount
          : 0,
      quote: holding.quote ?? null,
    });
  }
  return out;
}

function matchesQuery(holding: BagHolding, query: string): boolean {
  if (!query) return true;
  const name = holding.name.toLowerCase();
  const ticker = (holding.ticker || '').toLowerCase();
  return name.includes(query) || ticker.includes(query);
}

export function BagPageClient() {
  const { user, loading: authLoading } = useAuth();
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const [holdings, setHoldings] = useState<BagHolding[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeframe, setTimeframe] = useState<BagTimeframe>('24H');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!user || !wallet) {
      setHoldings([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/me/holdings?wallet=${encodeURIComponent(wallet)}`)
      .then(async response => {
        if (!response.ok) return { holdings: [] as unknown[] };
        return (await response.json()) as { holdings?: unknown };
      })
      .then(data => {
        if (cancelled) return;
        setHoldings(asHoldings(data.holdings));
      })
      .catch(() => {
        if (!cancelled) setHoldings([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, wallet]);

  const totals = useMemo(() => bagTotals(holdings), [holdings]);
  const header = useMemo(() => {
    return {
      ...formatBagHeader(totals),
      tone: coinChangeTone(totals.change24h),
    };
  }, [totals]);
  const series = useMemo(
    () => bagValueSeries(holdings, timeframe),
    [holdings, timeframe]
  );
  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () => holdings.filter(holding => matchesQuery(holding, needle)),
    [holdings, needle]
  );

  if (authLoading) {
    return <BagPageSkeleton />;
  }

  if (!user) {
    return (
      <AuthGateCard
        headline="Sign in to see your coins"
        why="Your coins, value, and 24h change live here."
        returnTo="/me"
      />
    );
  }

  return (
    <div className="bag-page">
      <BagIdentity user={user} />
      <div className="bag-grid">
        <div className="bag-main">
          <h1 className="listen-h1">Your coins</h1>
          <div className="bag-value-row">
            <p className="bag-value">{header.value}</p>
            <p className={`bag-chg is-${header.tone}`}>
              <span>{header.changeUsd}</span>
              <span>{header.change}</span>
            </p>
          </div>
          <div className="bag-ranges" role="group" aria-label="Value timeframe">
            {BAG_TIMEFRAMES.map(range => (
              <button
                key={range}
                type="button"
                className={`bag-range${timeframe === range ? ' is-on' : ''}`}
                aria-pressed={timeframe === range}
                onClick={() => setTimeframe(range)}
              >
                {range}
              </button>
            ))}
          </div>
          <BagSparkline points={series} timeframe={timeframe} />

          <section aria-label="Your positions">
            <div className="bag-section-head">
              <h2 className="bag-section-title">Your positions</h2>
              <span className="bag-section-count">{holdings.length}</span>
            </div>
            <label className="bag-search">
              <span className="sr-only">Search positions</span>
              <Search aria-hidden />
              <input
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Artists, tickers."
              />
            </label>
            {loading ? (
              <BagHoldingSkeletonList />
            ) : (
              <>
                <div className="bag-rows">
                  {visible.map(holding => (
                    <BagHoldingRow key={holding.mint} holding={holding} />
                  ))}
                </div>
                {holdings.length === 0 ? (
                  <div className="bag-empty">
                    <p>No artist coins yet</p>
                    <div className="bag-empty-actions">
                      <Link href="/discover" className={listenPrimaryClass}>
                        Discover
                      </Link>
                      <Link href="/artists" className={listenSecondaryClass}>
                        Artists
                      </Link>
                    </div>
                  </div>
                ) : visible.length === 0 ? (
                  <div className="bag-empty">
                    <p>No matching artists.</p>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
        <BagActivity />
      </div>
    </div>
  );
}
