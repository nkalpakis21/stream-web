import type { PlayReservation } from '@/lib/server/playRateLimit';

/**
 * Anonymous play attribution from mobile build 15.
 * `source` is only the enum below. Anything else is dropped and is never
 * used as a Firestore field path. There is no `other` bucket.
 */

export const PLAY_SOURCES = ['ios', 'android', 'web'] as const;
export type PlaySource = (typeof PLAY_SOURCES)[number];

export function parsePlaySource(value: unknown): PlaySource | null {
  if (value === 'ios' || value === 'android' || value === 'web') return value;
  return null;
}

/** A non-boolean is ignored. Only `true` bumps `playsBackground`. */
export function parsePlayBackground(value: unknown): boolean | null {
  if (typeof value !== 'boolean') return null;
  return value;
}

export type SongPatch =
  | { mode: 'invalid'; error: string }
  | { mode: 'increment'; source: PlaySource | null; background: boolean | null }
  | { mode: 'owner'; hasPlay: boolean; hasTitle: boolean; hasPublic: boolean };

/**
 * Increment-only bodies accept `source` and `background` and ignore every
 * other extra key. Owner updates stay on the strict whitelist.
 */
export function songPatchMode(record: Record<string, unknown>): SongPatch {
  const hasPlay = Object.prototype.hasOwnProperty.call(record, 'playCount');
  const hasTitle = Object.prototype.hasOwnProperty.call(record, 'title');
  const hasPublic = Object.prototype.hasOwnProperty.call(record, 'isPublic');

  if (!hasPlay && !hasTitle && !hasPublic) {
    return { mode: 'invalid', error: 'No valid fields to update' };
  }
  if (hasPlay && record.playCount !== 'increment') {
    return { mode: 'invalid', error: 'playCount only accepts "increment"' };
  }

  if (!hasTitle && !hasPublic) {
    return {
      mode: 'increment',
      source: Object.prototype.hasOwnProperty.call(record, 'source')
        ? parsePlaySource(record.source)
        : null,
      background: Object.prototype.hasOwnProperty.call(record, 'background')
        ? parsePlayBackground(record.background)
        : null,
    };
  }

  const allowed = new Set(['playCount', 'title', 'isPublic']);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) return { mode: 'invalid', error: `Unsupported field: ${unknown}` };
  return { mode: 'owner', hasPlay, hasTitle, hasPublic };
}

export type PlayAttribution = {
  source: PlaySource | null;
  background: boolean | null;
};

/**
 * Fields for one Admin `update`, using the same increment value as `playCount`.
 * Rate-limited plays return null so nothing is bumped. A source outside the
 * enum omits `playsBySource`. A non-boolean `background` omits `playsBackground`.
 */
export function countedPlayFieldUpdates(
  attribution: PlayAttribution,
  reservation: PlayReservation,
  increment: unknown
): Record<string, unknown> | null {
  if (reservation === 'limited') return null;
  const updates: Record<string, unknown> = { playCount: increment };
  if (
    attribution.source === 'ios' ||
    attribution.source === 'android' ||
    attribution.source === 'web'
  ) {
    updates[`playsBySource.${attribution.source}`] = increment;
  }
  if (attribution.background === true) {
    updates.playsBackground = increment;
  }
  return updates;
}

/**
 * One log line for a play that increments `playCount`. Rate-limited plays
 * return null. The line has no IP, no uid, and no raw client string.
 */
export function countedPlayLogLine(input: {
  songId: string;
  source: PlaySource | null;
  background: boolean | null;
  reservation: PlayReservation;
}): string | null {
  if (input.reservation === 'limited') return null;
  return `play_counted ${JSON.stringify({
    songId: input.songId,
    source: input.source,
    background: input.background,
  })}`;
}
