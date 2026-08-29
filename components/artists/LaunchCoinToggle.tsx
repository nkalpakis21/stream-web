'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletConnectControl } from '@/components/wallet/WalletConnectControl';
import { WALLET_COPY, connectedLabel } from '@/lib/wallet/copy';
import {
  defaultTickerFromName,
  MAX_COIN_NAME_LENGTH,
  MAX_TICKER_LENGTH,
  normalizeTicker,
} from '@/lib/solana/pumpFun';

interface LaunchCoinToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  artistName: string;
  coinName: string;
  onCoinNameChange: (name: string) => void;
  ticker: string;
  onTickerChange: (ticker: string) => void;
  lookUrl: string | null;
}

/**
 * Opt-in control for launching an artist-level coin.
 * Off by default. Name, ticker, and locked look are the coin; wallet signs once.
 * Connect chrome is Streamstar-styled — no chain jargon on the default path.
 */
export function LaunchCoinToggle({
  checked,
  onChange,
  disabled,
  artistName,
  coinName,
  onCoinNameChange,
  ticker,
  onTickerChange,
  lookUrl,
}: LaunchCoinToggleProps) {
  const { connected, publicKey } = useWallet();

  const handleToggle = (next: boolean) => {
    onChange(next);
    if (next) {
      if (!coinName.trim() && artistName.trim()) {
        onCoinNameChange(artistName.trim().slice(0, MAX_COIN_NAME_LENGTH));
      }
      if (!ticker.trim() && artistName.trim()) {
        onTickerChange(defaultTickerFromName(artistName));
      }
    }
  };

  const address = publicKey?.toBase58() ?? null;

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <input
          id="launchCoin"
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={e => handleToggle(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-border text-accent focus:ring-2 focus:ring-accent focus:ring-offset-0"
        />
        <label htmlFor="launchCoin" className="text-sm text-foreground cursor-pointer">
          Launch a coin for this artist
          <span className="ml-2 text-xs font-medium text-muted-foreground">
            Optional
          </span>
        </label>
      </div>

      {!checked ? (
        <p className="text-xs text-muted-foreground pl-7">
          Off by default. Artists can exist with no token.
        </p>
      ) : (
        <div className="pl-7 space-y-4">
          <p className="text-xs text-muted-foreground">
            Stay here to launch. {WALLET_COPY.launchHint} No first buy. Fans get a
            Buy link out.
          </p>

          <div>
            <label htmlFor="coinName" className="block text-sm font-medium mb-2 text-foreground">
              Coin name
            </label>
            <input
              id="coinName"
              type="text"
              maxLength={MAX_COIN_NAME_LENGTH}
              value={coinName}
              disabled={disabled}
              onChange={e => onCoinNameChange(e.target.value.slice(0, MAX_COIN_NAME_LENGTH))}
              placeholder={artistName.trim() || 'Same as artist name'}
              className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label htmlFor="coinTicker" className="block text-sm font-medium mb-2 text-foreground">
              Ticker
            </label>
            <input
              id="coinTicker"
              type="text"
              maxLength={MAX_TICKER_LENGTH}
              value={ticker}
              disabled={disabled}
              onChange={e => onTickerChange(normalizeTicker(e.target.value))}
              placeholder="e.g. NEON"
              className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all uppercase tracking-wide"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              2–10 letters or numbers.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {lookUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lookUrl}
                alt="Locked look used as coin image"
                className="w-12 h-12 rounded-full object-cover ring-2 ring-border"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-muted ring-2 ring-border" />
            )}
            <p className="text-xs text-muted-foreground">
              {lookUrl
                ? 'Locked look is the coin image.'
                : 'Lock a look above so it can be the coin image.'}
            </p>
          </div>

          {connected && address ? (
            <p className="text-xs text-muted-foreground">
              {connectedLabel(address)}. {WALLET_COPY.launchHint}
            </p>
          ) : (
            <WalletConnectControl disabled={disabled} />
          )}
        </div>
      )}
    </div>
  );
}
