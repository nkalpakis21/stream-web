import { createHmac } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

/** Window for counted plays of one song from one IP. */
export const PLAY_SONG_WINDOW_MS = 30_000;
/** Counted plays allowed per (IP, song) inside PLAY_SONG_WINDOW_MS. */
export const PLAY_SONG_MAX_PER_WINDOW = 5;
/** Window for counted plays from one IP across every song. */
export const PLAY_IP_WINDOW_MS = 60_000;
/** Counted plays allowed per IP inside PLAY_IP_WINDOW_MS. */
export const PLAY_IP_MAX_PER_WINDOW = 300;
/** Firestore TTL field. Deletion is not instant; the windows above are enforced in code. */
export const PLAY_LIMIT_TTL_MS = 24 * 60 * 60 * 1000;

export function playLimitHmacSecret(): string | null {
  const secret = process.env.PLAY_LIMIT_HMAC_SECRET?.trim();
  return secret || null;
}

/**
 * HMAC-SHA256 of the client IP only. The raw IP is not returned or stored.
 * `x-device-id` is not part of the key.
 */
export function playListenerKey(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(ip).digest('hex');
}

export function playSongLimitDocId(listenerKey: string, songId: string): string {
  return createHmac('sha256', listenerKey).update(`song\n${songId}`).digest('hex');
}

export function playClientLimitDocId(listenerKey: string): string {
  return createHmac('sha256', listenerKey).update('client').digest('hex');
}

export function requestClientIp(request: {
  headers: { get(name: string): string | null };
  ip?: string | null;
}): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  if (request.ip) return request.ip;
  return 'unknown';
}

export function evaluatePlayLimit(input: {
  nowMs: number;
  songWindowStartMs: number | null;
  songCount: number;
  ipWindowStartMs: number | null;
  ipCount: number;
}): {
  allowed: boolean;
  nextSongWindowStartMs: number;
  nextSongCount: number;
  nextIpWindowStartMs: number;
  nextIpCount: number;
} {
  const songWindow = openWindow(
    input.songWindowStartMs,
    input.songCount,
    input.nowMs,
    PLAY_SONG_WINDOW_MS
  );
  const ipWindow = openWindow(
    input.ipWindowStartMs,
    input.ipCount,
    input.nowMs,
    PLAY_IP_WINDOW_MS
  );

  if (songWindow.count >= PLAY_SONG_MAX_PER_WINDOW || ipWindow.count >= PLAY_IP_MAX_PER_WINDOW) {
    return {
      allowed: false,
      nextSongWindowStartMs: songWindow.startMs,
      nextSongCount: songWindow.count,
      nextIpWindowStartMs: ipWindow.startMs,
      nextIpCount: ipWindow.count,
    };
  }

  return {
    allowed: true,
    nextSongWindowStartMs: songWindow.startMs,
    nextSongCount: songWindow.count + 1,
    nextIpWindowStartMs: ipWindow.startMs,
    nextIpCount: ipWindow.count + 1,
  };
}

function openWindow(
  startMs: number | null,
  count: number,
  nowMs: number,
  windowMs: number
): { startMs: number; count: number } {
  if (startMs == null || nowMs - startMs >= windowMs) {
    return { startMs: nowMs, count: 0 };
  }
  return { startMs, count };
}

function millisOf(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { toMillis?: () => number };
  if (typeof candidate.toMillis !== 'function') return null;
  return candidate.toMillis();
}

export type PlayReservation = 'counted' | 'limited' | 'open';

/**
 * Reserve a counted play. Missing HMAC secret or a limiter error fails open
 * (`open`) so listening still increments. `limited` means do not increment.
 */
export async function reservePlayCount(
  request: { headers: { get(name: string): string | null }; ip?: string | null },
  songId: string,
  nowMs: number = Date.now()
): Promise<PlayReservation> {
  const secret = playLimitHmacSecret();
  if (!secret) {
    console.warn(
      '[playLimit] PLAY_LIMIT_HMAC_SECRET is not set; counting this play without a rate limit'
    );
    return 'open';
  }

  try {
    const listenerKey = playListenerKey(requestClientIp(request), secret);
    const db = getAdminDb();
    const songRef = db
      .collection(COLLECTIONS.playRateLimits)
      .doc(playSongLimitDocId(listenerKey, songId));
    const clientRef = db
      .collection(COLLECTIONS.playRateLimits)
      .doc(playClientLimitDocId(listenerKey));

    return await db.runTransaction(async (tx) => {
      const [songSnap, clientSnap] = await Promise.all([
        tx.get(songRef),
        tx.get(clientRef),
      ]);
      const decision = evaluatePlayLimit({
        nowMs,
        songWindowStartMs: songSnap.exists ? millisOf(songSnap.get('windowStart')) : null,
        songCount: songSnap.exists ? Number(songSnap.get('count') ?? 0) : 0,
        ipWindowStartMs: clientSnap.exists ? millisOf(clientSnap.get('windowStart')) : null,
        ipCount: clientSnap.exists ? Number(clientSnap.get('count') ?? 0) : 0,
      });
      if (!decision.allowed) return 'limited';

      const expireAt = Timestamp.fromMillis(nowMs + PLAY_LIMIT_TTL_MS);
      tx.set(songRef, {
        songId,
        windowStart: Timestamp.fromMillis(decision.nextSongWindowStartMs),
        count: decision.nextSongCount,
        expireAt,
      });
      tx.set(clientRef, {
        windowStart: Timestamp.fromMillis(decision.nextIpWindowStartMs),
        count: decision.nextIpCount,
        expireAt,
      });
      return 'counted';
    });
  } catch (error) {
    console.warn('[playLimit] Rate limiter failed open; counting this play:', error);
    return 'open';
  }
}
