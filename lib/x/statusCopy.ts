export function formatPostedAgo(thenMs: number, nowMs: number): string {
  const delta = Math.max(0, nowMs - thenMs);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** User-local clock, e.g. "5:40 PM". */
export function formatLocalClock(ms: number, locales?: Intl.LocalesArgument): string {
  return new Date(ms).toLocaleTimeString(locales, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export type XStatusLine =
  | { tone: 'reconnect'; text: 'Reconnect X' }
  | { tone: 'deferred'; text: string }
  | { tone: 'skipped'; text: string }
  | { tone: 'posted'; text: string }
  | { tone: 'handle'; text: string; href: string }
  | { tone: 'none'; text: '' };

function handleLine(username: string | null): XStatusLine {
  const handle = username?.replace(/^@/, '').trim();
  if (!handle) return { tone: 'none', text: '' };
  return { tone: 'handle', text: `@${handle}`, href: `https://x.com/${handle}` };
}

/**
 * One status line under the auto-post row.
 * Paused (including auth) is Reconnect. A waiting song names itself.
 * A 24h drop stays until the next successful post clears the title.
 * When nothing else applies, the connected handle is the line.
 */
export function xAutoPostStatusLine(input: {
  paused: boolean;
  autoPost: boolean;
  username: string | null;
  lastPostedAt: number | null;
  pendingTitle: string | null;
  pendingNotBeforeMs: number | null;
  lastSkippedTitle: string | null;
  nowMs: number;
  formatClock?: (ms: number) => string;
}): XStatusLine {
  if (input.paused) return { tone: 'reconnect', text: 'Reconnect X' };
  if (input.autoPost) {
    if (input.pendingTitle && input.pendingNotBeforeMs != null) {
      const clock = (input.formatClock ?? formatLocalClock)(input.pendingNotBeforeMs);
      return { tone: 'deferred', text: `${input.pendingTitle} posts after ${clock}` };
    }
    if (input.lastSkippedTitle) {
      return { tone: 'skipped', text: `${input.lastSkippedTitle} skipped (daily limit)` };
    }
    if (input.lastPostedAt != null && Number.isFinite(input.lastPostedAt)) {
      const ago = formatPostedAgo(input.lastPostedAt, input.nowMs);
      const handle = input.username ? ` · @${input.username.replace(/^@/, '')}` : '';
      return { tone: 'posted', text: `Last posted ${ago}${handle}` };
    }
  }
  return handleLine(input.username);
}
