'use client';

import { useXConfigured } from '@/components/artists/XConnectConfig';

interface ConnectXToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * Opt-in control for connecting a public X account as this artist.
 * Hidden when Connect X is not configured. Off by default.
 */
export function ConnectXToggle({
  checked,
  onChange,
  disabled,
}: ConnectXToggleProps) {
  const configured = useXConfigured();
  if (!configured) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
      <div className="flex items-start gap-3">
        <input
          id="connectX"
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-border text-accent focus:ring-2 focus:ring-accent focus:ring-offset-0"
        />
        <label htmlFor="connectX" className="text-sm text-foreground cursor-pointer">
          Connect X for this artist
          <span className="ml-2 text-xs font-medium text-muted-foreground">
            Optional
          </span>
        </label>
      </div>
      <p className="text-xs text-muted-foreground pl-7">
        {checked
          ? 'After create, you’ll connect this artist’s own X. Posts when a public song goes live.'
          : 'Off by default. You can create the artist without X.'}
      </p>
    </div>
  );
}
