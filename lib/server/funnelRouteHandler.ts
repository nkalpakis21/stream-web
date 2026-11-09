import { NextRequest } from 'next/server';
import { z } from 'zod';
import { canonicalVisitorId } from '@/lib/analytics/visitorId';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { platformFromRequest } from '@/lib/funnel/platform';
import { noStoreJson } from '@/lib/http/noStore';
import { requestClientIp } from '@/lib/server/playRateLimit';
import { adminGetSong, adminGetSongVersions } from '@/lib/server/songsAdmin';
import { playableAudioUrl } from '@/lib/songs/audioAvailability';
import { songIsSharePublic } from '@/lib/songs/shareCard';
import {
  ANONYMOUS_PLAY_HOUR_MAX,
  ANONYMOUS_PLAY_HOUR_MS,
  isClientFunnelEvent,
  isPlayRateLimited,
  playRateKey,
  sanitizeFunnelProps,
  SHARE_PAGE_SOURCE,
  trackAnonymousSharePlay,
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
    visitorId: z.string().trim().min(1).max(80).optional(),
    source: z.literal(SHARE_PAGE_SOURCE).optional(),
  })
  .strict();

type TokenVerifier = (idToken: string) => Promise<{ uid: string }>;

export type FunnelSongRecord = {
  artistId?: string | null;
  isPublic?: unknown;
  deletedAt?: unknown;
  ownerId?: unknown;
  audioReady?: unknown;
  generationStatus?: unknown;
  /** False when no version has playable audio. Omitted means playable. */
  playable?: boolean;
};

type SongLookup = (songId: string) => Promise<FunnelSongRecord | null>;

let verifyForTests: TokenVerifier | null = null;
let nowForTests: (() => number) | null = null;
let songLookupForTests: SongLookup | null = null;
const recentPlays = new Map<string, number>();
const visitorHours = new Map<string, { start: number; count: number }>();
const ipHours = new Map<string, { start: number; count: number }>();

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

export function setFunnelSongLookupForTests(lookup: SongLookup | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setFunnelSongLookupForTests is disabled in production');
  }
  songLookupForTests = lookup;
}

export function resetFunnelRateLimitForTests(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('resetFunnelRateLimitForTests is disabled in production');
  }
  recentPlays.clear();
  visitorHours.clear();
  ipHours.clear();
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

function hourCount(map: Map<string, { start: number; count: number }>, key: string, now: number): number {
  const bucket = map.get(key);
  if (!bucket || now - bucket.start >= ANONYMOUS_PLAY_HOUR_MS) return 0;
  return bucket.count;
}

function hourBump(map: Map<string, { start: number; count: number }>, key: string, now: number): void {
  if (map.size > RECENT_MAX) {
    const oldest = map.keys().next().value;
    if (oldest) map.delete(oldest);
  }
  const bucket = map.get(key);
  if (!bucket || now - bucket.start >= ANONYMOUS_PLAY_HOUR_MS) {
    map.set(key, { start: now, count: 1 });
    return;
  }
  bucket.count += 1;
}

function hasBearer(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  return Boolean(authHeader?.startsWith('Bearer ') && authHeader.slice('Bearer '.length).trim());
}

async function lookupSong(songId: string): Promise<FunnelSongRecord | null> {
  if (songLookupForTests) return songLookupForTests(songId);
  if (process.env.NODE_TEST_CONTEXT) return null;
  const song = await adminGetSong(songId);
  if (!song) return null;
  const versions = await adminGetSongVersions(song.id || songId);
  return {
    artistId: song.artistId,
    isPublic: song.isPublic,
    deletedAt: song.deletedAt,
    ownerId: song.ownerId,
    audioReady: song.audioReady,
    generationStatus: song.generationStatus,
    playable: playableAudioUrl(versions) != null,
  };
}

function anonymousActor(visitorId: string): string {
  return `visitor:${visitorId}`;
}

/**
 * POST /api/funnel
 * Signed-in client events: play and song_shared.
 * An unauthenticated body may only be a share-page play:
 * `{ event: 'play', songId, visitorId, source: 'share_page' }`.
 * play is limited to one per song per 30s. Anonymous plays are also
 * capped at 60 an hour per visitor and per IP.
 */
export async function POST(request: NextRequest) {
  try {
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
    const platform = platformFromRequest(request);

    if (!hasBearer(request)) {
      if (event !== 'play') {
        return noStoreJson({ error: 'Authentication required. Provide Bearer token.' }, 401);
      }
      const anonymousAttempt =
        parsed.data.source === SHARE_PAGE_SOURCE || parsed.data.visitorId != null;
      if (!anonymousAttempt) {
        return noStoreJson({ error: 'Authentication required. Provide Bearer token.' }, 401);
      }
      const visitorId = canonicalVisitorId(parsed.data.visitorId);
      if (parsed.data.source !== SHARE_PAGE_SOURCE || !parsed.data.songId || !visitorId) {
        return noStoreJson({ error: visitorId ? 'Invalid funnel event' : 'Invalid visitor' }, 400);
      }
      const song = await lookupSong(parsed.data.songId);
      if (!song || !songIsSharePublic(song) || song.playable === false) {
        return noStoreJson({ error: 'Song not found' }, 404);
      }
      const actor = anonymousActor(visitorId);
      if (isPlayRateLimited(recentPlays, actor, parsed.data.songId, now)) {
        return noStoreJson({ ok: true });
      }
      const ip = requestClientIp(request);
      if (
        hourCount(visitorHours, visitorId, now) >= ANONYMOUS_PLAY_HOUR_MAX ||
        hourCount(ipHours, ip, now) >= ANONYMOUS_PLAY_HOUR_MAX
      ) {
        return noStoreJson({ error: 'Too many plays' }, 429);
      }
      try {
        await trackAnonymousSharePlay({
          visitorId,
          songId: parsed.data.songId,
          artistId: song.artistId,
          platform,
        });
        rememberPlay(actor, parsed.data.songId, now);
        hourBump(visitorHours, visitorId, now);
        hourBump(ipHours, ip, now);
      } catch (error) {
        console.error('[funnel] play', error instanceof Error ? error.message : 'failed');
      }
      return noStoreJson({ ok: true });
    }

    const uid = await requireUser(request, {
      verifyToken: verifyForTests ?? undefined,
    });
    if (event === 'play' && isPlayRateLimited(recentPlays, uid, parsed.data.songId, now)) {
      return noStoreJson({ ok: true });
    }

    try {
      await trackFunnelEvent(
        uid,
        event,
        sanitizeFunnelProps({
          songId: parsed.data.songId,
          artistId: parsed.data.artistId,
        }),
        platform,
        event === 'play' && parsed.data.source === SHARE_PAGE_SOURCE ? SHARE_PAGE_SOURCE : undefined
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
