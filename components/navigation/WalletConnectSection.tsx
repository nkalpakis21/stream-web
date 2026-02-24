'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton, useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useAuth } from '@/components/providers/AuthProvider';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getUserPath } from '@/lib/firebase/collections';
import type { UserDocument } from '@/types/firestore';

export function WalletConnectSection() {
  const { user } = useAuth();
  const { publicKey, connected, wallet, select, connect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [solanaWalletAddress, setSolanaWalletAddress] = useState<
    string | null | undefined
  >(undefined);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!user) {
      setSolanaWalletAddress(null);
      return;
    }
    const fetchUser = async () => {
      const userRef = doc(db, getUserPath(user.uid));
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data() as UserDocument;
        setSolanaWalletAddress(data.solanaWalletAddress ?? null);
      } else {
        setSolanaWalletAddress(null);
      }
    };
    fetchUser();
  }, [user]);

  // Auto-connect when user selects a wallet from the modal (e.g. Phantom)
  useEffect(() => {
    if (wallet && !connected && !connecting) {
      connect().catch(() => {
        // Error handled by provider onError
      });
    }
  }, [wallet, connected, connecting, connect]);

  const handleLinkWallet = async () => {
    if (!user || !publicKey) return;
    setLinking(true);
    try {
      const token = await user.getIdToken(true);
      const res = await fetch('/api/users/link-wallet', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publicKey: publicKey.toBase58() }),
      });
      if (res.ok) {
        setSolanaWalletAddress(publicKey.toBase58());
      }
    } catch (err) {
      console.error('Failed to link wallet:', err);
    } finally {
      setLinking(false);
    }
  };

  const isLinked =
    connected &&
    publicKey &&
    solanaWalletAddress === publicKey.toBase58();

  const needsLink =
    connected &&
    publicKey &&
    solanaWalletAddress !== publicKey.toBase58();

  if (!user) {
    return null;
  }

  const handleChangeWallet = () => {
    select(null);
    setVisible(true);
  };

  return (
    <div className="flex flex-col gap-2">
      <WalletMultiButton className="!h-8 !rounded-lg !text-sm" />
      {wallet && !connected && (
        <button
          type="button"
          onClick={handleChangeWallet}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Change wallet
        </button>
      )}
      {needsLink && (
        <button
          onClick={handleLinkWallet}
          disabled={linking}
          className="w-full px-3 py-2 text-xs font-medium rounded-lg bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-50 transition-colors"
        >
          {linking ? 'Linking...' : 'Link to account'}
        </button>
      )}
      {isLinked && (
        <p className="text-xs text-muted-foreground truncate">
          {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
        </p>
      )}
    </div>
  );
}
