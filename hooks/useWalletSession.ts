'use client';

import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { getFreshIdToken } from '@/lib/api/clientAuth';
import { setWalletLiveStatus } from '@/lib/wallet/liveStatus';

const linkedThisSession = new Set<string>();

function adapterAddress(
  publicKey: { toBase58(): string } | null | undefined,
  wallet: { adapter?: { publicKey?: { toBase58(): string } | null } } | null | undefined
): string | null {
  return publicKey?.toBase58() ?? wallet?.adapter?.publicKey?.toBase58() ?? null;
}

/**
 * After the user picks a wallet in the picker, connect it.
 * Mount once (e.g. next to the wallet provider).
 */
export function useAutoConnectSelectedWallet() {
  const { wallet, connected, connecting, connect } = useWallet();

  useEffect(() => {
    if (wallet && !connected && !connecting) {
      connect().catch(() => {
        // Error handled by provider onError
      });
    }
  }, [wallet, connected, connecting, connect]);
}

/**
 * Push adapter connect/disconnect into a module store so the user menu
 * flips to Connected · last 4 without a reload.
 */
export function usePublishWalletLiveStatus() {
  const { publicKey, connected, connecting, wallet } = useWallet();

  useEffect(() => {
    const adapter = wallet?.adapter;
    const publish = () => {
      // Prefer the adapter's live key so connect/disconnect events
      // are not stuck on a stale React publicKey from this effect.
      const address = adapter
        ? adapter.publicKey?.toBase58() ?? null
        : publicKey?.toBase58() ?? null;
      const adapterConnected = Boolean(
        address && (connected || adapter?.connected || adapter?.publicKey)
      );
      const adapterConnecting = Boolean(
        connecting || (adapter && 'connecting' in adapter && adapter.connecting)
      );
      setWalletLiveStatus({
        address,
        connected: adapterConnected,
        connecting: adapterConnecting && !address,
      });
    };

    publish();
    if (!adapter) return undefined;

    adapter.on('connect', publish);
    adapter.on('disconnect', publish);
    adapter.on('readyStateChange', publish);
    return () => {
      adapter.off('connect', publish);
      adapter.off('disconnect', publish);
      adapter.off('readyStateChange', publish);
    };
  }, [publicKey, connected, connecting, wallet]);
}

/**
 * Link the connected wallet to the signed-in Firebase account.
 * No second "Link to account" step.
 */
export function useAutoLinkWallet() {
  const { user } = useAuth();
  const { publicKey, connected, wallet } = useWallet();
  const inFlight = useRef<string | null>(null);

  useEffect(() => {
    const address = adapterAddress(publicKey, wallet);
    if (!user || !address) return;
    if (!connected && !wallet?.adapter?.connected && !wallet?.adapter?.publicKey) {
      return;
    }

    const key = `${user.uid}:${address}`;
    if (linkedThisSession.has(key) || inFlight.current === key) return;

    let cancelled = false;
    inFlight.current = key;

    (async () => {
      try {
        const token = await getFreshIdToken(user);
        const res = await fetch('/api/users/link-wallet', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ publicKey: address }),
        });
        if (res.ok && !cancelled) {
          linkedThisSession.add(key);
        }
      } catch (err) {
        console.error('Failed to link wallet:', err);
      } finally {
        if (inFlight.current === key) {
          inFlight.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, connected, publicKey, wallet]);
}

export function WalletSessionEffects() {
  useAutoConnectSelectedWallet();
  usePublishWalletLiveStatus();
  useAutoLinkWallet();
  return null;
}
