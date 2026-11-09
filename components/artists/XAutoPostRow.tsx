'use client';

import type { XStatusLine } from '@/lib/x/statusCopy';

function SwitchFace({ on, disabled }: { on: boolean; disabled?: boolean }) {
  return (
    <span
      className={disabled ? 'x-auto-switch is-disabled' : 'x-auto-switch'}
      data-on={on ? 'true' : 'false'}
      aria-hidden
    >
      <span className="x-auto-switch-knob" />
    </span>
  );
}

function RowCopy() {
  return (
    <span className="x-auto-copy">
      <span className="owner-flat-title">Auto-post new songs to X</span>
      <span className="owner-flat-sub">
        Posts once when a public song is ready, with its share card. Up to 3 a day.
      </span>
    </span>
  );
}

export function XAutoPostRow({
  connected,
  paused,
  autoPost,
  busy,
  status,
  error,
  onToggle,
  onConnect,
  onDisconnect,
}: {
  connected: boolean;
  paused: boolean;
  autoPost: boolean;
  busy: boolean;
  status: XStatusLine;
  error: string | null;
  onToggle: (enabled: boolean) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const canToggle = connected && !paused;

  return (
    <div className="x-auto">
      {canToggle ? (
        <button
          type="button"
          role="switch"
          aria-checked={autoPost}
          aria-label="Auto-post new songs to X"
          className="x-auto-row"
          disabled={busy}
          onClick={() => onToggle(!autoPost)}
        >
          <RowCopy />
          <SwitchFace on={autoPost} />
        </button>
      ) : connected ? (
        <div className="x-auto-row is-static">
          <RowCopy />
          <SwitchFace on={false} disabled />
        </div>
      ) : (
        <button type="button" className="x-auto-row" disabled={busy} onClick={onConnect}>
          <RowCopy />
          <span className="x-auto-connect">Connect X</span>
        </button>
      )}
      {status.tone === 'reconnect' ? (
        <button type="button" className="x-auto-reconnect" onClick={onConnect} disabled={busy}>
          Reconnect X
        </button>
      ) : null}
      {status.tone === 'deferred' || status.tone === 'posted' ? (
        <p className="x-auto-status">{status.text}</p>
      ) : null}
      {status.tone === 'skipped' ? (
        <p className="x-auto-status is-skipped">{status.text}</p>
      ) : null}
      {status.tone === 'handle' ? (
        <a className="x-auto-handle" href={status.href} target="_blank" rel="noreferrer">
          {status.text}
        </a>
      ) : null}
      {connected ? (
        <button type="button" className="x-auto-disconnect" onClick={onDisconnect} disabled={busy}>
          Disconnect
        </button>
      ) : null}
      {error ? (
        <p className="x-auto-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
