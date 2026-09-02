'use client';

import { useCallback, useEffect, useId, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { useWallet, type Wallet } from '@solana/wallet-adapter-react';
import { WALLET_COPY, connectedLabel } from '@/lib/wallet/copy';
import { useWalletLiveStatus } from '@/lib/wallet/liveStatus';

const CONNECT_BUTTON_CLASS =
  'w-full px-4 py-2.5 bg-accent text-accent-foreground rounded-[12px] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm shadow-soft';

const QUIET_BUTTON_CLASS =
  'w-full px-3 py-2 bg-accent text-accent-foreground rounded-[12px] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm';

const QUIET_ACTION_CLASS =
  'text-xs text-muted-foreground hover:text-foreground transition-colors';

const PICKER_WALLETS = [
  { name: 'Phantom', installUrl: 'https://phantom.app/download' },
  { name: 'Solflare', installUrl: 'https://www.solflare.com/download/' },
] as const;

function canConnect(wallet: Wallet | undefined): wallet is Wallet {
  return (
    !!wallet &&
    (wallet.readyState === WalletReadyState.Installed ||
      wallet.readyState === WalletReadyState.Loadable)
  );
}

function pickerRows(wallets: Wallet[]) {
  return PICKER_WALLETS.map(spec => ({
    ...spec,
    wallet: wallets.find(w => w.adapter.name === spec.name),
  }));
}

const pickerListeners = new Set<() => void>();
let pickerOpen = false;

function subscribePicker(listener: () => void) {
  pickerListeners.add(listener);
  return () => {
    pickerListeners.delete(listener);
  };
}

function getPickerOpen() {
  return pickerOpen;
}

function setPickerOpen(next: boolean) {
  if (pickerOpen === next) return;
  pickerOpen = next;
  pickerListeners.forEach(listener => listener());
}

interface WalletConnectControlProps {
  /** Compact control for the user menu. */
  variant?: 'default' | 'quiet';
  disabled?: boolean;
  /** Close a parent overlay (e.g. the user menu) before the picker opens. */
  onPickerOpen?: () => void;
}

export function WalletConnectControl({
  variant = 'default',
  disabled,
  onPickerOpen,
}: WalletConnectControlProps) {
  const { publicKey, connected, connecting, disconnect, select, wallet } =
    useWallet();
  const live = useWalletLiveStatus();

  const address =
    live.address ??
    publicKey?.toBase58() ??
    wallet?.adapter.publicKey?.toBase58() ??
    null;
  const isConnecting =
    (live.connecting || connecting || Boolean(wallet?.adapter.connecting)) &&
    !address;
  const isConnected = Boolean(address) && (live.connected || connected);
  const buttonClass =
    variant === 'quiet' ? QUIET_BUTTON_CLASS : CONNECT_BUTTON_CLASS;

  const openPicker = () => {
    onPickerOpen?.();
    setPickerOpen(true);
  };

  const handleConnect = () => {
    if (disabled || isConnecting) return;
    openPicker();
  };

  const handleChange = () => {
    if (disabled) return;
    select(null);
    openPicker();
  };

  const handleDisconnect = () => {
    if (disabled) return;
    disconnect().catch(() => {
      // Provider onError logs failures
    });
  };

  if (isConnecting) {
    return (
      <button type="button" disabled className={buttonClass}>
        {WALLET_COPY.connecting}
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <div className="flex flex-col gap-1.5">
        <p
          className={
            variant === 'quiet'
              ? 'text-sm text-foreground'
              : 'text-sm font-medium text-foreground'
          }
        >
          {connectedLabel(address)}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleChange}
            disabled={disabled}
            className={QUIET_ACTION_CLASS}
          >
            {WALLET_COPY.change}
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disabled}
            className={QUIET_ACTION_CLASS}
          >
            {WALLET_COPY.disconnect}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleConnect}
      disabled={disabled}
      className={buttonClass}
    >
      {WALLET_COPY.connect}
    </button>
  );
}

/** Viewport-level picker. Mount once next to the wallet provider. */
export function WalletPickerLayer() {
  const isOpen = useSyncExternalStore(
    subscribePicker,
    getPickerOpen,
    () => false
  );
  const { wallets, select } = useWallet();

  const handlePick = useCallback(
    (wallet: Wallet | undefined, installUrl: string) => {
      if (canConnect(wallet)) {
        select(wallet.adapter.name);
      } else {
        window.open(installUrl, '_blank', 'noopener,noreferrer');
      }
      setPickerOpen(false);
    },
    [select]
  );

  if (!isOpen) return null;

  return (
    <WalletPicker
      wallets={wallets}
      onPick={handlePick}
      onClose={() => setPickerOpen(false)}
    />
  );
}

function WalletPicker({
  wallets,
  onPick,
  onClose,
}: {
  wallets: Wallet[];
  onPick: (wallet: Wallet | undefined, installUrl: string) => void;
  onClose: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Always Phantom then Solflare, including NotDetected. Do not hide
  // uninstalled wallets — tap opens that wallet's official install URL.
  const list = pickerRows(wallets);

  // Portal to document.body so overflow/transform on the user menu (or any
  // parent) cannot clip or re-contain this overlay.
  return createPortal(
    <div
      data-wallet-picker
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 max-[390px]:items-end max-[390px]:p-0"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-sm bg-card border border-border/60 rounded-xl shadow-xl p-4 space-y-3 max-[390px]:max-w-none max-[390px]:rounded-b-none max-[390px]:rounded-t-2xl max-[390px]:border-x-0 max-[390px]:border-b-0 max-[390px]:pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <h2 id={titleId} className="text-sm font-medium text-foreground">
          {WALLET_COPY.pickerTitle}
        </h2>
        <ul className="flex flex-col gap-2">
          {list.map(row => (
            <li key={row.name}>
              <button
                type="button"
                onClick={() => onPick(row.wallet, row.installUrl)}
                className="w-full flex items-center gap-3 px-4 py-2.5 bg-muted/40 hover:bg-accent/15 text-foreground rounded-[12px] transition-colors text-sm font-medium"
              >
                {row.wallet?.adapter.icon ? (
                  // Wallet adapter icons are data URIs from the installed extension.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.wallet.adapter.icon}
                    alt=""
                    className="w-5 h-5 rounded"
                  />
                ) : null}
                {row.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}
