'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { AuthGateCard } from '@/components/auth/AuthGateCard';
import { WalletConnectControl } from '@/components/wallet/WalletConnectControl';
import {
  listenPrimaryClass,
  listenSecondaryClass,
} from '@/components/states/BrandDeadEnd';
import { coinChangeTone } from '@/lib/brand/coinStats';
import { bagTotals, formatBagHeader } from '@/lib/brand/bagStats';
import { BagHoldingRow, type BagHolding } from '@/components/bag/BagHoldingRow';
import { BagHoldingSkeletonList } from '@/components/bag/BagHoldingSkeleton';

export function BagPageClient() {
  const { user, loading: authLoading } = useAuth();
  const { publicKey, connected } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const [holdings, setHoldings] = useState<BagHolding[]>([]);
  const [loading, setLoading] = useState(false);

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
        if (!response.ok) return { holdings: [] as BagHolding[] };
        return (await response.json()) as { holdings?: BagHolding[] };
      })
      .then(data => {
        if (cancelled) return;
        setHoldings(Array.isArray(data.holdings) ? data.holdings : []);
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

  const header = useMemo(() => {
    const totals = bagTotals(holdings);
    return {
      ...formatBagHeader(totals),
      tone: coinChangeTone(totals.change24h),
    };
  }, [holdings]);

  if (authLoading) {
    return (
      <div>
        <div className="mb-8 animate-pulse">
          <div className="mb-2 h-10 w-48 rounded bg-muted lg:h-12" />
          <div className="h-6 w-32 rounded bg-muted" />
        </div>
        <BagHoldingSkeletonList />
      </div>
    );
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

  if (!connected || !wallet) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          Connect a wallet to see your artist coins.
        </p>
        <div className="w-full max-w-xs">
          <WalletConnectControl />
        </div>
        <Link href="/discover" className={listenSecondaryClass}>
          Discover
        </Link>
      </div>
    );
  }

  if (loading) {
    return <BagHoldingSkeletonList />;
  }

  if (holdings.length === 0) {
    return (
      <div>
        <BagHeader value="$0" change="0%" tone="flat" />
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">No artist coins yet</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/discover" className={listenPrimaryClass}>
              Discover
            </Link>
            <Link href="/artists" className={listenSecondaryClass}>
              Artists
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <BagHeader value={header.value} change={header.change} tone={header.tone} />
      <div className="flex flex-col gap-2">
        {holdings.map(holding => (
          <BagHoldingRow key={holding.mint} holding={holding} />
        ))}
      </div>
    </div>
  );
}

function BagHeader({
  value,
  change,
  tone,
}: {
  value: string;
  change: string;
  tone: 'up' | 'down' | 'flat';
}) {
  const changeColor =
    tone === 'down' ? 'var(--down)' : tone === 'up' ? 'var(--heat)' : 'var(--mute)';

  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-baseline gap-3">
        <p className="listen-title tabular-nums" style={{ color: 'var(--ink)' }}>
          {value}
        </p>
        <p
          className="text-lg font-semibold tabular-nums"
          style={{ color: changeColor }}
        >
          {change}
        </p>
      </div>
    </div>
  );
}
