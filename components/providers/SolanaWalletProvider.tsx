'use client';

import { useMemo } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

import { WalletSessionEffects } from '@/hooks/useWalletSession';
import { WalletPickerLayer } from '@/components/wallet/WalletConnectControl';

export function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => {
    return (
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta')
    );
  }, []);

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        autoConnect={false}
        onError={(err) => {
          console.error(
            '[Wallet] Connection error:',
            err,
            '\nTroubleshooting: In Phantom, go to Settings → Connected Apps and disconnect this site, then try again. Also ensure Phantom is on the same network as this app.'
          );
        }}
      >
        <WalletModalProvider>
          <WalletSessionEffects />
          <WalletPickerLayer />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
