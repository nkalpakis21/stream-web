'use client';

import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { LaunchCoinToggle } from '@/components/artists/LaunchCoinToggle';
import { getFreshIdToken, userFacingApiError } from '@/lib/api/clientAuth';
import { launchPumpFunForExistingArtist } from '@/lib/solana/launchArtistPumpFunCoin';
import { LAUNCH_FAILED_NOTICE } from '@/lib/solana/pumpFun';
import type { PumpFunCoin } from '@/types/firestore';

interface LaunchExistingArtistCoinProps {
  artistId: string;
  artistName: string;
  lore: string;
  lookUrl: string | null;
  disabled?: boolean;
  onLaunched: (coin: PumpFunCoin) => void;
}

/**
 * Owner-only launch on an existing artist with no coin.
 * Reuses LaunchCoinToggle + launchArtistPumpFunCoin. Persists only after
 * the wallet-signed tx confirms. Failures leave the artist unchanged.
 */
export function LaunchExistingArtistCoin({
  artistId,
  artistName,
  lore,
  lookUrl,
  disabled,
  onLaunched,
}: LaunchExistingArtistCoinProps) {
  const { user } = useAuth();
  const { connection } = useConnection();
  const { publicKey, connected, signTransaction } = useWallet();
  const [launchCoin, setLaunchCoin] = useState(false);
  const [coinName, setCoinName] = useState('');
  const [ticker, setTicker] = useState('');
  const [launching, setLaunching] = useState(false);

  const busy = Boolean(disabled || launching);

  const persistCoin = async (coin: PumpFunCoin, token: string) => {
    const res = await fetch(`/api/artists/${artistId}/pump-fun`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mint: coin.mint,
        url: coin.url,
        symbol: coin.symbol,
        launchedAt: coin.launchedAt?.toMillis?.() ?? Date.now(),
        creatorWallet: coin.creatorWallet,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        userFacingApiError(res.status, data.error, LAUNCH_FAILED_NOTICE)
      );
    }
  };

  const handleLaunch = async () => {
    if (!user || busy || !launchCoin) return;

    setLaunching(true);
    try {
      const pumpWallet =
        connected && publicKey && signTransaction
          ? { publicKey, signTransaction }
          : null;

      const { coin, launchNotice } = await launchPumpFunForExistingArtist({
        coinName: coinName.trim() || artistName,
        ticker,
        imageUrl: lookUrl,
        description: lore,
        wallet: pumpWallet,
        connection,
        getIdToken: () => getFreshIdToken(user),
      });

      if (!coin) {
        alert(launchNotice || LAUNCH_FAILED_NOTICE);
        return;
      }

      const token = await getFreshIdToken(user);
      try {
        await persistCoin(coin, token);
      } catch (firstError) {
        try {
          await persistCoin(coin, token);
        } catch {
          throw firstError;
        }
      }

      onLaunched(coin);
    } catch (error) {
      console.error('Failed to launch artist coin:', error);
      alert(userFacingApiError(undefined, error, LAUNCH_FAILED_NOTICE));
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="space-y-4">
      <LaunchCoinToggle
        checked={launchCoin}
        onChange={setLaunchCoin}
        disabled={busy}
        artistName={artistName}
        coinName={coinName}
        onCoinNameChange={setCoinName}
        ticker={ticker}
        onTickerChange={setTicker}
        lookUrl={lookUrl}
      />
      {launchCoin && (
        <button
          type="button"
          onClick={handleLaunch}
          disabled={busy}
          className="w-full px-6 py-3 bg-accent text-accent-foreground rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-soft"
        >
          {launching ? 'Launching…' : 'Launch coin'}
        </button>
      )}
    </div>
  );
}
