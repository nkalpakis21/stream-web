'use client';

import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { getFreshIdToken } from '@/lib/api/clientAuth';

const linkedThisSession = new Set<string>();

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
 * Link the connected wallet to the signed-in Firebase account.
 * No second "Link to account" step.
 */
export function useAutoLinkWallet() {
  const { user } = useAuth();
  const { publicKey, connected } = useWallet();
  const inFlight = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !connected || !publicKey) return;

    const address = publicKey.toBase58();
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
  }, [user, connected, publicKey]);
}

export function WalletSessionEffects() {
  useAutoConnectSelectedWallet();
  useAutoLinkWallet();
  return null;
}
