/**
 * Owner opt-in for song-live posts.
 *
 * Missing `autoPost` on a connection whose status is `connected` (not paused,
 * not disconnected) is on: they opted in by connecting before the flag
 * existed. Every other missing field is off, including paused and disconnected.
 * An explicit true or false always wins.
 *
 * Turning the switch on stores `autoPostEnabledAt` and never backfills.
 * A grandfathered connection with no `autoPostEnabledAt` is stamped at the
 * first post evaluation (`now`) and persisted, so songs already ready are skipped.
 */

export type AutoPostSource = {
  status?: string | null;
  autoPost?: boolean | null;
  autoPostEnabledAtMs?: number | null;
};

export function timestampMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const record = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
  if (typeof record.toMillis === 'function') {
    const ms = record.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  const seconds = typeof record.seconds === 'number' ? record.seconds : record._seconds;
  if (typeof seconds === 'number' && Number.isFinite(seconds)) return Math.round(seconds * 1000);
  return null;
}

export function resolveAutoPost(source: AutoPostSource | null | undefined): boolean {
  if (!source) return false;
  if (source.autoPost === true) return true;
  if (source.autoPost === false) return false;
  return source.status === 'connected';
}

export type GrandfatherStamp = {
  autoPost?: true;
  autoPostEnabledAtMs: number;
};

/**
 * Fields to persist the first time a grandfathered (or enabled, unstamped)
 * connection is evaluated. Null when nothing is missing.
 */
export function grandfatherStamp(
  source: AutoPostSource | null | undefined,
  nowMs: number
): GrandfatherStamp | null {
  if (!resolveAutoPost(source)) return null;
  const enabled = source?.autoPostEnabledAtMs;
  const missingEnabled = enabled == null || !Number.isFinite(enabled);
  const missingFlag = source?.autoPost == null;
  if (!missingEnabled && !missingFlag) return null;
  return {
    ...(missingFlag ? { autoPost: true as const } : {}),
    autoPostEnabledAtMs: missingEnabled ? nowMs : (enabled as number),
  };
}

/** Switch write. On always stores a fresh enabledAt. Off leaves the old one. */
export function autoPostSwitchPatch(
  enabled: boolean,
  nowMs: number
): { autoPost: boolean; autoPostEnabledAtMs?: number } {
  if (!enabled) return { autoPost: false };
  return { autoPost: true, autoPostEnabledAtMs: nowMs };
}

/**
 * Token revoked or an auth failure paused posting.
 * Spam and rate-limit pauses use a different lastError.
 */
export function isXAuthPaused(source: {
  status?: string | null;
  lastError?: string | null;
}): boolean {
  if (source.status !== 'paused') return false;
  const error = (source.lastError || '').toLowerCase();
  return /authentication failed|reconnect this artist/.test(error);
}

/** Fans never see the row. Hidden entirely when Connect X is not configured. */
export function ownerSeesXAutoPost(isOwner: boolean, configured: boolean): boolean {
  return isOwner && configured;
}
