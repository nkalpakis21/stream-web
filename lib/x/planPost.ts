import { evaluatePostCap } from './caps';

export const AUTO_POST_OFF_REASON = 'auto-post off';
export const BEFORE_AUTO_POST_REASON = 'song ready before auto-post';
export const BLOCKED_REASON = 'blocked';
export const STALE_REASON = 'skipped_stale';
export const DEFERRED_REASON = 'deferred';
export const ALREADY_CLAIMED_REASON = 'Already posted or claimed';

const TERMINAL_REASONS: Record<string, string> = {
  posted: ALREADY_CLAIMED_REASON,
  pending: ALREADY_CLAIMED_REASON,
  blocked: BLOCKED_REASON,
  failed: 'X posting failed',
  skipped: BEFORE_AUTO_POST_REASON,
  skipped_stale: STALE_REASON,
};

export type SongLivePlan =
  | { type: 'skip'; reason: string }
  | { type: 'terminal'; status: 'skipped' | 'blocked' | 'skipped_stale'; reason: string }
  | { type: 'defer'; notBeforeMs: number }
  | { type: 'post' };

/**
 * One decision for a song-live post. Deferred claims are re-evaluated.
 * Posted, blocked, failed, skipped, and in-flight pending claims are not.
 */
export function planSongLivePost(input: {
  nowMs: number;
  autoPost: boolean;
  enabledAtMs: number | null;
  songReadyAtMs: number;
  postedAtMs: readonly number[];
  blocked: boolean;
  existingStatus?: string | null;
}): SongLivePlan {
  const existing = input.existingStatus || null;
  if (existing && Object.prototype.hasOwnProperty.call(TERMINAL_REASONS, existing)) {
    return { type: 'skip', reason: TERMINAL_REASONS[existing] };
  }
  if (!input.autoPost) return { type: 'skip', reason: AUTO_POST_OFF_REASON };
  if (input.enabledAtMs == null || input.songReadyAtMs < input.enabledAtMs) {
    return { type: 'terminal', status: 'skipped', reason: BEFORE_AUTO_POST_REASON };
  }
  if (input.blocked) return { type: 'terminal', status: 'blocked', reason: BLOCKED_REASON };
  const slot = evaluatePostCap({
    nowMs: input.nowMs,
    readyAtMs: input.songReadyAtMs,
    postedAtMs: input.postedAtMs,
  });
  if (slot.action === 'post') return { type: 'post' };
  if (slot.action === 'defer') return { type: 'defer', notBeforeMs: slot.notBeforeMs };
  return { type: 'terminal', status: 'skipped_stale', reason: STALE_REASON };
}
