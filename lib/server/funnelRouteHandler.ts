import { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { platformFromRequest } from '@/lib/funnel/platform';
import { noStoreJson } from '@/lib/http/noStore';
import {
  isClientFunnelEvent,
  isPlayRateLimited,
  playRateKey,
  sanitizeFunnelProps,
  trackFunnelEvent,
} from '@/lib/server/funnel';

const MAX_BODY_CHARS = 2048;
const RECENT_MAX = 5_000;

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const bodySchema = z
  .object({
    event: z.string(),
    songId: idSchema.optional(),
    artistId: idSchema.optional(),
  })
  .strict();

type TokenVerifier = (idToken: string) => Promise<{ uid: string }>;

let verifyForTests: TokenVerifier | null = null;
let nowForTests: (() => number) | null = null;
const recentPlays = new Map<string, number>();

export function setFunnelRouteAuthForTests(verify: TokenVerifier | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setFunnelRouteAuthForTests is disabled in production');
  }
  verifyForTests = verify;
}

export function setFunnelNowForTests(now: (() => number) | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setFunnelNowForTests is disabled in production');
  }
  nowForTests = now;
}

export function resetFunnelRateLimitForTests(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('resetFunnelRateLimitForTests is disabled in production');
  }
  recentPlays.clear();
}

function nowMs(): number {
  return nowForTests ? nowForTests() : Date.now();
}

function rememberPlay(uid: string, songId: string | undefined, now: number): void {
  if (recentPlays.size > RECENT_MAX) {
    const oldest = recentPlays.keys().next().value;
    if (oldest) recentPlays.delete(oldest);
  }
  recentPlays.set(playRateKey(uid, songId), now);
}

/**
 * POST /api/funnel
 * Signed-in client events only: play and song_shared.
 * The uid comes from the ID token. play is limited to one per song per 30s.
 * song_shared is written every time.
 */
export async function POST(request: NextRequest) {
  try {
    const uid = await requireUser(request, {
      verifyToken: verifyForTests ?? undefined,
    });
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) {
      return noStoreJson({ error: 'Invalid request' }, 400);
    }
    let json: unknown;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      return noStoreJson({ error: 'Invalid request' }, 400);
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success || !isClientFunnelEvent(parsed.data.event)) {
      return noStoreJson({ error: 'Invalid funnel event' }, 400);
    }

    const event = parsed.data.event;
    const now = nowMs();
    if (event === 'play' && isPlayRateLimited(recentPlays, uid, parsed.data.songId, now)) {
      return noStoreJson({ ok: true });
    }

    const platform = platformFromRequest(request);
    try {
      await trackFunnelEvent(
        uid,
        event,
        sanitizeFunnelProps({
          songId: parsed.data.songId,
          artistId: parsed.data.artistId,
        }),
        platform
      );
      if (event === 'play') rememberPlay(uid, parsed.data.songId, now);
    } catch (error) {
      console.error(
        '[funnel]',
        event,
        error instanceof Error ? error.message : 'failed'
      );
    }
    return noStoreJson({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[funnel]', error instanceof Error ? error.message : 'failed');
    return noStoreJson({ ok: true });
  }
}
