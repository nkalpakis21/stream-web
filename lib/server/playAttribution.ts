import type { PlayReservation } from '@/lib/server/playRateLimit';

/**
 * Anonymous play attribution from mobile build 15 and later.
 *
 * `playsBySource` and `playsBackground` are not written on the song.
 * Draft PR #95 `songServerFieldsUnchanged()` requires
 * `request.resource.data.keys().hasOnly([...])` and that list has no
 * room for those fields. An Admin write would stick, then every later
 * client song update (owner edit or playCount bump) would fail the rules.
 */

export const PLAY_SOURCES = ['ios', 'android', 'web'] as const;
export type PlaySource = (typeof PLAY_SOURCES)[number] | 'other';

const PLAY_SOURCE_MAX_LENGTH = 32;

export function normalizePlaySource(value: unknown): PlaySource {
  if (typeof value !== 'string') return 'other';
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > PLAY_SOURCE_MAX_LENGTH) return 'other';
  if (trimmed === 'ios' || trimmed === 'android' || trimmed === 'web') return trimmed;
  return 'other';
}

/** Only a real boolean true counts as a background play. */
export function normalizePlayBackground(value: unknown): boolean {
  return value === true;
}

export type SongPatch =
  | { mode: 'invalid'; error: string }
  | { mode: 'increment'; source: PlaySource; background: boolean }
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
        ? normalizePlaySource(record.source)
        : 'other',
      background: Object.prototype.hasOwnProperty.call(record, 'background')
        ? normalizePlayBackground(record.background)
        : false,
    };
  }

  const allowed = new Set(['playCount', 'title', 'isPublic']);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) return { mode: 'invalid', error: `Unsupported field: ${unknown}` };
  return { mode: 'owner', hasPlay, hasTitle, hasPublic };
}

/**
 * One log line for a play that increments `playCount`. Rate-limited plays
 * return null so nothing is recorded. The line has no IP and no uid.
 */
export function countedPlayLogLine(input: {
  songId: string;
  source: PlaySource;
  background: boolean;
  reservation: PlayReservation;
}): string | null {
  if (input.reservation === 'limited') return null;
  return `play_counted ${JSON.stringify({
    songId: input.songId,
    source: input.source,
    background: input.background,
  })}`;
}
