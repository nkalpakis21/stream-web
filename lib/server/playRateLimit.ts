import { createHmac } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

/** At most one counted play per listener per song in this window. */
export const PLAY_SONG_INTERVAL_MS = 30_000;
/** Cap counted plays per listener across songs. */
export const PLAY_CLIENT_WINDOW_MS = 60_000;
export const PLAY_CLIENT_MAX_PER_WINDOW = 20;
/** Firestore TTL field. Deletion is not instant; the windows above are enforced in code. */
export const PLAY_LIMIT_TTL_MS = 24 * 60 * 60 * 1000;

const DEVICE_ID_HEADER = 'x-device-id';

export function playLimitHmacSecret(): string | null {
  const secret = process.env.PLAY_LIMIT_HMAC_SECRET?.trim();
  return secret || null;
}

/**
 * HMAC-SHA256 of IP and optional device id. IPv4 is too small to hash plainly.
 * The raw IP is not returned or stored.
 */
export function playListenerKey(
  ip: string,
  deviceId: string | null,
  secret: string
): string {
  return createHmac('sha256', secret)
    .update(`${ip}\n${deviceId ?? ''}`)
    .digest('hex');
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

/** This repo does not send a device id. Honor the header when a client does. */
export function requestDeviceId(request: {
  headers: { get(name: string): string | null };
}): string | null {
  const deviceId = request.headers.get(DEVICE_ID_HEADER)?.trim();
  return deviceId || null;
}

export function evaluatePlayLimit(input: {
  nowMs: number;
  songLastCountedAtMs: number | null;
  clientWindowStartMs: number | null;
  clientCount: number;
}): { allowed: boolean; nextWindowStartMs: number; nextCount: number } {
  const songLast = input.songLastCountedAtMs;
  if (songLast != null && input.nowMs - songLast < PLAY_SONG_INTERVAL_MS) {
    return {
      allowed: false,
      nextWindowStartMs: input.clientWindowStartMs ?? input.nowMs,
      nextCount: input.clientCount,
    };
  }

  let windowStart = input.clientWindowStartMs ?? input.nowMs;
  let count = input.clientCount;
  if (
    input.clientWindowStartMs == null ||
    input.nowMs - windowStart >= PLAY_CLIENT_WINDOW_MS
  ) {
    windowStart = input.nowMs;
    count = 0;
  }

  if (count >= PLAY_CLIENT_MAX_PER_WINDOW) {
    return { allowed: false, nextWindowStartMs: windowStart, nextCount: count };
  }

  return {
    allowed: true,
    nextWindowStartMs: windowStart,
    nextCount: count + 1,
  };
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
    const listenerKey = playListenerKey(
      requestClientIp(request),
      requestDeviceId(request),
      secret
    );
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
        songLastCountedAtMs: songSnap.exists
          ? millisOf(songSnap.get('lastCountedAt'))
          : null,
        clientWindowStartMs: clientSnap.exists
          ? millisOf(clientSnap.get('windowStart'))
          : null,
        clientCount: clientSnap.exists ? Number(clientSnap.get('count') ?? 0) : 0,
      });
      if (!decision.allowed) return 'limited';

      const expireAt = Timestamp.fromMillis(nowMs + PLAY_LIMIT_TTL_MS);
      tx.set(songRef, {
        songId,
        lastCountedAt: Timestamp.fromMillis(nowMs),
        expireAt,
      });
      tx.set(clientRef, {
        windowStart: Timestamp.fromMillis(decision.nextWindowStartMs),
        count: decision.nextCount,
        expireAt,
      });
      return 'counted';
    });
  } catch (error) {
    console.warn('[playLimit] Rate limiter failed open; counting this play:', error);
    return 'open';
  }
}
