/**
 * POST /api/lyrics/draft
 *
 * Firebase auth, then MusicGPT GET /v1/prompt_to_lyrics.
 * Three drafts per create-session id, and 30 per user per UTC day.
 * The counter lives on lyricsDraftQuota/{uid} (Admin SDK only) with expireAt
 * for Firestore TTL. The limits are enforced here even if TTL has not deleted
 * the doc yet.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { createMusicGptLyrics } from '@/lib/ai/providers/musicgpt';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { isLyricsSessionId, SONG_LYRICS_MAX } from '@/lib/create/songOptions';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAdminDb } from '@/lib/firebase/admin';
import { adminGetArtist } from '@/lib/server/artistsAdmin';
import { assertNoObjectionableContent } from '@/lib/server/objectionable';
import type { AIArtistDocument } from '@/types/firestore';

export const LYRICS_DRAFTS_PER_SESSION = 3;
export const LYRICS_DRAFTS_PER_DAY = 30;
/** Short TTL for one create attempt. Refreshed on each successful reserve. */
export const LYRICS_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
/** Doc TTL. A new UTC day resets the daily count even if the doc is still here. */
export const LYRICS_DAY_TTL_MS = 48 * 60 * 60 * 1000;

const LYRICS_PROMPT_MAX = 1000;

export type LyricsSessionCount = {
  count: number;
  expiresAtMs: number;
};

export type LyricsQuotaState = {
  dayKey: string;
  dayCount: number;
  sessions: Record<string, LyricsSessionCount>;
};

export type LyricsQuotaDecision =
  | { ok: true; remaining: number; state: LyricsQuotaState }
  | { ok: false; reason: 'session' | 'day'; remaining: 0 };

export function lyricsDraftDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function cleanSessions(
  sessions: Record<string, LyricsSessionCount> | undefined,
  nowMs: number
): Record<string, LyricsSessionCount> {
  const next: Record<string, LyricsSessionCount> = {};
  if (!sessions) return next;
  for (const [id, entry] of Object.entries(sessions)) {
    if (!entry || typeof entry.count !== 'number' || typeof entry.expiresAtMs !== 'number') continue;
    if (entry.expiresAtMs <= nowMs) continue;
    if (!isLyricsSessionId(id)) continue;
    next[id] = { count: entry.count, expiresAtMs: entry.expiresAtMs };
  }
  return next;
}

/**
 * Reserve one draft. Session count resets when its TTL has passed.
 * Day count resets when the UTC day key changes.
 */
export function nextLyricsDraftQuota(
  current: LyricsQuotaState | null,
  sessionId: string,
  nowMs: number
): LyricsQuotaDecision {
  const dayKey = lyricsDraftDayKey(nowMs);
  const dayCount = current && current.dayKey === dayKey ? current.dayCount : 0;
  const sessions = cleanSessions(current?.sessions, nowMs);
  const sessionCount = sessions[sessionId]?.count ?? 0;
  if (sessionCount >= LYRICS_DRAFTS_PER_SESSION) {
    return { ok: false, reason: 'session', remaining: 0 };
  }
  if (dayCount >= LYRICS_DRAFTS_PER_DAY) {
    return { ok: false, reason: 'day', remaining: 0 };
  }
  const nextCount = sessionCount + 1;
  sessions[sessionId] = {
    count: nextCount,
    expiresAtMs: nowMs + LYRICS_SESSION_TTL_MS,
  };
  return {
    ok: true,
    remaining: LYRICS_DRAFTS_PER_SESSION - nextCount,
    state: {
      dayKey,
      dayCount: dayCount + 1,
      sessions,
    },
  };
}

function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function clipList(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = clip(item, maxLen);
    if (!text) continue;
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

export type LyricsPromptSource = {
  name?: string | null;
  genres?: readonly string[] | null;
  moods?: readonly string[] | null;
  vocalIdentity?: string | null;
  lore?: string | null;
};

/** Prefer the song prompt. An empty prompt becomes a line from the artist's DNA. */
export function buildLyricsDraftPrompt(
  prompt: string | null | undefined,
  source?: LyricsPromptSource | null
): string {
  const typed = clip(prompt, LYRICS_PROMPT_MAX);
  if (typed) return typed;
  const parts: string[] = [];
  const name = clip(source?.name, 80);
  if (name) parts.push(`A song for ${name}`);
  const genres = (source?.genres ?? []).map(item => clip(item, 40)).filter(Boolean);
  if (genres.length) parts.push(genres.join(', '));
  const moods = (source?.moods ?? []).map(item => clip(item, 40)).filter(Boolean);
  if (moods.length) parts.push(moods.join(', '));
  const vocal = clip(source?.vocalIdentity, 160);
  if (vocal) parts.push(vocal);
  const lore = clip(source?.lore, 280);
  if (lore) parts.push(lore);
  return parts.join('. ').slice(0, LYRICS_PROMPT_MAX).trim();
}

function sourceFromArtist(artist: AIArtistDocument): LyricsPromptSource {
  return {
    name: artist.name,
    genres: artist.styleDNA?.genres ?? [],
    moods: artist.styleDNA?.moods ?? [],
    vocalIdentity: artist.vocalIdentity,
    lore: artist.lore,
  };
}

function sourceFromStyle(raw: unknown): LyricsPromptSource | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  return {
    name: clip(record.name, 80),
    genres: clipList(record.genres, 8, 40),
    moods: clipList(record.moods, 8, 40),
    vocalIdentity: clip(record.vocalIdentity, 160),
    lore: clip(record.lore, 280),
  };
}

export type LyricsDraftDeps = {
  verifyToken?: (idToken: string) => Promise<{ uid: string }>;
  getArtist?: (artistId: string) => Promise<AIArtistDocument | null>;
  reserve?: (uid: string, sessionId: string, nowMs: number) => Promise<LyricsQuotaDecision>;
  createLyrics?: (prompt: string) => Promise<string>;
  now?: () => number;
};

let depsForTests: LyricsDraftDeps | null = null;

export function setLyricsDraftDepsForTests(deps: LyricsDraftDeps | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Lyrics draft test hooks are disabled in production');
  }
  depsForTests = deps;
}

function draftDeps(): LyricsDraftDeps {
  if (process.env.NODE_ENV === 'production') return {};
  return depsForTests ?? {};
}

function quotaFromDoc(data: Record<string, unknown> | undefined): LyricsQuotaState | null {
  if (!data) return null;
  const dayKey = typeof data.dayKey === 'string' ? data.dayKey : '';
  const dayCount = typeof data.dayCount === 'number' && Number.isFinite(data.dayCount) ? data.dayCount : 0;
  const sessions: Record<string, LyricsSessionCount> = {};
  const rawSessions = data.sessions;
  if (rawSessions && typeof rawSessions === 'object' && !Array.isArray(rawSessions)) {
    for (const [id, entry] of Object.entries(rawSessions as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as { count?: unknown; expiresAtMs?: unknown };
      if (typeof row.count !== 'number' || typeof row.expiresAtMs !== 'number') continue;
      sessions[id] = { count: row.count, expiresAtMs: row.expiresAtMs };
    }
  }
  return { dayKey, dayCount, sessions };
}

export async function reserveLyricsDraft(
  uid: string,
  sessionId: string,
  nowMs: number
): Promise<LyricsQuotaDecision> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.lyricsDraftQuota).doc(uid);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const current = snap.exists ? quotaFromDoc(snap.data() as Record<string, unknown>) : null;
    const decision = nextLyricsDraftQuota(current, sessionId, nowMs);
    if (!decision.ok) return decision;
    tx.set(ref, {
      dayKey: decision.state.dayKey,
      dayCount: decision.state.dayCount,
      sessions: decision.state.sessions,
      expireAt: Timestamp.fromMillis(nowMs + LYRICS_DAY_TTL_MS),
      updatedAt: Timestamp.fromMillis(nowMs),
    });
    return decision;
  });
}

function quotaError(reason: 'session' | 'day'): string {
  if (reason === 'day') return 'Daily draft limit reached.';
  return 'This song already has 3 drafts.';
}

export async function postLyricsDraft(request: NextRequest): Promise<NextResponse> {
  try {
    const deps = draftDeps();
    const uid = await requireUser(request, { verifyToken: deps.verifyToken });
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    if (!isLyricsSessionId(body.sessionId)) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const artistId = typeof body.artistId === 'string' ? body.artistId.trim() : '';
    let source: LyricsPromptSource | null = sourceFromStyle(body.style);
    if (artistId) {
      const artist = await (deps.getArtist ?? adminGetArtist)(artistId);
      if (!artist || artist.deletedAt) {
        return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
      }
      if (artist.ownerId !== uid) {
        return NextResponse.json({ error: 'Only the owner can draft for this artist' }, { status: 403 });
      }
      source = sourceFromArtist(artist);
    }

    const typedPrompt = typeof body.prompt === 'string' ? body.prompt : '';
    const prompt = buildLyricsDraftPrompt(typedPrompt, source);
    if (!prompt) {
      return NextResponse.json({ error: 'Add a prompt or pick an artist first.' }, { status: 400 });
    }
    assertNoObjectionableContent(prompt);

    const nowMs = deps.now ? deps.now() : Date.now();
    const decision = await (deps.reserve ?? reserveLyricsDraft)(uid, body.sessionId, nowMs);
    if (!decision.ok) {
      return NextResponse.json(
        { error: quotaError(decision.reason), remaining: 0, reason: decision.reason },
        { status: 429 }
      );
    }

    let lyrics: string;
    try {
      lyrics = await (deps.createLyrics ?? createMusicGptLyrics)(prompt);
    } catch (error) {
      console.error(
        '[lyrics draft] MusicGPT failed',
        error instanceof Error ? error.message : 'failed'
      );
      return NextResponse.json(
        { error: "Couldn't write a draft.", remaining: decision.remaining },
        { status: 502 }
      );
    }

    const text = lyrics.trim().slice(0, SONG_LYRICS_MAX);
    if (!text) {
      return NextResponse.json(
        { error: "Couldn't write a draft.", remaining: decision.remaining },
        { status: 502 }
      );
    }
    try {
      assertNoObjectionableContent(text);
    } catch (error) {
      if (error instanceof HttpError) {
        return NextResponse.json({ error: error.message, remaining: decision.remaining }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ lyrics: text, remaining: decision.remaining });
  } catch (error) {
    return errorResponse(error);
  }
}
