'use client';

import { useEffect, useState } from 'react';

interface ConnectXToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * Opt-in control for connecting a public X account as this artist.
 * Off by default. Same shape as LaunchCoinToggle.
 * If X_CLIENT_ID is unset, connect is disabled with a clear message — no fake posts.
 */
export function ConnectXToggle({
  checked,
  onChange,
  disabled,
}: ConnectXToggleProps) {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/x/status')
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setAvailable(Boolean(data.available));
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const configured = available !== false;

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
        {available === false
          ? 'X is not configured (set X_CLIENT_ID and X_CLIENT_SECRET). You can still create this artist without X.'
          : checked
            ? configured
              ? 'After create, you will authorize X as this artist’s account (not a Streamstar company account). Streamstar will post when a public song goes live.'
              : 'X is not configured. The artist will be created without X.'
            : 'Off by default. Connect later from the artist page. Posts as the artist’s own X account when a song goes live.'}
      </p>
    </div>
  );
}
