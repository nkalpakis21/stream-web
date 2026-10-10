'use client';

import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { LaunchCoinToggle } from '@/components/artists/LaunchCoinToggle';
import { getFreshIdToken, userFacingApiError } from '@/lib/api/clientAuth';
import { launchPumpFunForExistingArtist } from '@/lib/solana/launchArtistPumpFunCoin';
import { LAUNCH_NO_TOKEN_NOTICE } from '@/lib/solana/pumpFun';
import type { PumpFunCoin } from '@/types/firestore';
import { useToast, ToastContainer } from '@/components/ui/toast';

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
  const { publicKey, connected, signTransaction, sendTransaction } = useWallet();
  const [launchCoin, setLaunchCoin] = useState(false);
  const [coinName, setCoinName] = useState('');
  const [ticker, setTicker] = useState('');
  const [launching, setLaunching] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();

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
        userFacingApiError(
          res.status,
          data.error,
          'Coin launched but saving it failed. Try again.'
        )
      );
    }
  };

  const handleLaunch = async () => {
    if (!user || busy || !launchCoin) return;

    setLaunching(true);
    try {
      const pumpWallet =
        connected && publicKey
          ? { publicKey, signTransaction, sendTransaction }
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
        showToast(launchNotice || LAUNCH_NO_TOKEN_NOTICE, 'error');
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
      showToast(
        userFacingApiError(undefined, error, 'Could not save the coin. Try again.'),
        'error'
      );
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <LaunchCoinToggle
        variant="flat"
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
        <div className="owner-flat-extra">
          <button
            type="button"
            onClick={handleLaunch}
            disabled={busy}
            className="btn-primary w-full"
          >
            {launching ? 'Launching…' : 'Launch coin'}
          </button>
        </div>
      )}
    </div>
  );
}
