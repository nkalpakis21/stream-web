'use client';

import { WalletConnectControl } from '@/components/wallet/WalletConnectControl';

/** Quiet wallet control for the user menu. */
export function WalletConnectSection({
  onPickerOpen,
}: {
  onPickerOpen?: () => void;
}) {
  return <WalletConnectControl variant="quiet" onPickerOpen={onPickerOpen} />;
}
