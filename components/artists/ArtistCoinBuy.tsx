'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletConnectControl } from '@/components/wallet/WalletConnectControl';

/**
 * Connect chrome next to a fan Buy destination. The Buy link itself stays
 * on ArtistPumpFunBuyLink (mint stays off the default path).
 */
export function ArtistCoinBuy({ url }: { url: string | null | undefined }) {
  const { connected } = useWallet();

  if (!url || connected) return null;

  return (
    <div className="mt-3 flex flex-col items-start gap-2">
      <WalletConnectControl />
    </div>
  );
}
