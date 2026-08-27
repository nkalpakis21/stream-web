'use client';

interface LaunchCoinToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * Opt-in control for launching an artist-level pump.fun coin.
 * Off by default. Launch is stubbed until a real wallet-signed path is wired;
 * opting in must not persist fake mint/url/symbol values.
 */
export function LaunchCoinToggle({
  checked,
  onChange,
  disabled,
}: LaunchCoinToggleProps) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
      <div className="flex items-start gap-3">
        <input
          id="launchCoin"
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-border text-accent focus:ring-2 focus:ring-accent focus:ring-offset-0"
        />
        <label htmlFor="launchCoin" className="text-sm text-foreground cursor-pointer">
          Launch a pump.fun coin for this artist
          <span className="ml-2 text-xs font-medium text-muted-foreground">
            Optional
          </span>
        </label>
      </div>
      <p className="text-xs text-muted-foreground pl-7">
        {checked
          ? 'Coin launch is not available yet. Your artist will still be created without a token.'
          : 'Off by default. Artists can exist with no token.'}
      </p>
    </div>
  );
}
