/** Max song-live posts per artist in a rolling day, and the quiet period between them. */
export const X_POSTS_PER_DAY = 3;
export const X_POST_GAP_MS = 2 * 60 * 60 * 1000;
export const X_POST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A reservation older than this is ignored so a crash cannot hold the cap. */
export const X_RESERVATION_MS = 10 * 60 * 1000;

export type PostCap =
  | { action: 'post' }
  | { action: 'defer'; notBeforeMs: number }
  | { action: 'skip_stale' };

/**
 * Earliest time a new post is allowed.
 * Three posts inside the last 24h wait until the oldest of those three ages out.
 * A post also waits until two hours after the latest post (or live reservation).
 */
export function nextAllowedPostMs(postedAtMs: readonly number[], nowMs: number): number {
  const finite = postedAtMs
    .filter(at => Number.isFinite(at) && at <= nowMs)
    .sort((a, b) => a - b);
  let notBefore = nowMs;
  if (finite.length > 0) {
    const gapAt = finite[finite.length - 1] + X_POST_GAP_MS;
    if (gapAt > notBefore) notBefore = gapAt;
  }
  const recent = finite.filter(at => nowMs - at < X_POST_WINDOW_MS);
  if (recent.length >= X_POSTS_PER_DAY) {
    const opensAt = recent[recent.length - X_POSTS_PER_DAY] + X_POST_WINDOW_MS;
    if (opensAt > notBefore) notBefore = opensAt;
  }
  return notBefore;
}

/**
 * Post now, defer until `notBeforeMs`, or drop.
 * A song that cannot go out within 24h of becoming ready is `skip_stale`.
 * `readyAt + 24h` is still inside the window. One millisecond later is not.
 */
export function evaluatePostCap(input: {
  nowMs: number;
  readyAtMs: number;
  postedAtMs: readonly number[];
}): PostCap {
  const staleAt = input.readyAtMs + X_POST_WINDOW_MS;
  if (!(input.nowMs <= staleAt)) return { action: 'skip_stale' };
  const notBefore = nextAllowedPostMs(input.postedAtMs, input.nowMs);
  if (notBefore <= input.nowMs) return { action: 'post' };
  if (notBefore > staleAt) return { action: 'skip_stale' };
  return { action: 'defer', notBeforeMs: notBefore };
}

export function capPostTimes(input: {
  nowMs: number;
  songId: string;
  posted: ReadonlyArray<{ songId?: string | null; atMs: number | null }>;
  reservations?: ReadonlyArray<{ songId?: string | null; atMs: number | null }>;
}): number[] {
  const times: number[] = [];
  const postedIds = new Set<string>();
  for (const post of input.posted) {
    if (post.atMs == null || !Number.isFinite(post.atMs)) continue;
    times.push(post.atMs);
    if (post.songId) postedIds.add(post.songId);
  }
  for (const reservation of input.reservations ?? []) {
    if (!reservation.songId || reservation.songId === input.songId) continue;
    if (postedIds.has(reservation.songId)) continue;
    if (reservation.atMs == null || !Number.isFinite(reservation.atMs)) continue;
    if (reservation.atMs > input.nowMs) continue;
    if (input.nowMs - reservation.atMs > X_RESERVATION_MS) continue;
    times.push(reservation.atMs);
  }
  return times;
}
