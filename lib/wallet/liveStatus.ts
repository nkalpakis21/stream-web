'use client';

import { useSyncExternalStore } from 'react';

export type WalletLiveStatus = {
  connected: boolean;
  connecting: boolean;
  address: string | null;
};

const disconnected: WalletLiveStatus = {
  connected: false,
  connecting: false,
  address: null,
};

let status: WalletLiveStatus = disconnected;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(listener => listener());
}

export function subscribeWalletLiveStatus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWalletLiveStatus(): WalletLiveStatus {
  return status;
}

export function setWalletLiveStatus(next: WalletLiveStatus) {
  if (
    status.connected === next.connected &&
    status.connecting === next.connecting &&
    status.address === next.address
  ) {
    return;
  }
  status = next;
  emit();
}

/** Live adapter snapshot. Menu and create-artist read this, not a mount-time copy. */
export function useWalletLiveStatus(): WalletLiveStatus {
  return useSyncExternalStore(
    subscribeWalletLiveStatus,
    getWalletLiveStatus,
    () => disconnected
  );
}
