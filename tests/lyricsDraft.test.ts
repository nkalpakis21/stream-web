import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/lyrics/draft/route';
import { musicGptPromptToLyricsUrl } from '../lib/ai/providers/musicgpt';
import {
  LYRICS_DRAFTS_PER_DAY,
  LYRICS_DRAFTS_PER_SESSION,
  buildLyricsDraftPrompt,
  nextLyricsDraftQuota,
  setLyricsDraftDepsForTests,
  type LyricsQuotaState,
} from '../lib/server/lyricsDraft';
import type { AIArtistDocument } from '../types/firestore';

const SESSION = 'session-1';
const NOW = Date.UTC(2026, 10, 10, 15, 0, 0);

function artist(): AIArtistDocument {
  return {
    id: 'artist-1',
    ownerId: 'alice',
    name: 'Nova',
    nameLowercase: 'nova',
    avatarURL: null,
    styleDNA: {
      genres: ['pop'],
      moods: ['chill'],
      tempoRange: { min: 90, max: 110 },
      influences: [],
    },
    lore: 'Night drives and soft choruses.',
    vocalIdentity: 'warm alto',
    isPublic: true,
    createdAt: {} as AIArtistDocument['createdAt'],
    updatedAt: {} as AIArtistDocument['updatedAt'],
    deletedAt: null,
    currentVersionId: 'av-1',
  };
}

afterEach(() => {
  setLyricsDraftDepsForTests(null);
});

describe('lyrics draft prompt and quota', () => {
  it('uses the typed prompt and falls back to artist DNA when it is empty', () => {
    assert.equal(buildLyricsDraftPrompt('  a hopeful chorus  ', null), 'a hopeful chorus');
    const fallback = buildLyricsDraftPrompt('   ', {
      name: 'Nova',
      genres: ['pop'],
      moods: ['chill'],
      vocalIdentity: 'warm alto',
      lore: 'Night drives.',
    });
    assert.match(fallback, /A song for Nova/);
    assert.match(fallback, /pop/);
    assert.match(fallback, /chill/);
    assert.match(fallback, /warm alto/);
    assert.match(fallback, /Night drives/);
    assert.equal(buildLyricsDraftPrompt('  ', null), '');
  });

  it('allows 3 drafts in a session and 30 in a day, then resets the session after TTL', () => {
    let state: LyricsQuotaState | null = null;
    for (let i = 0; i < LYRICS_DRAFTS_PER_SESSION; i += 1) {
      const decision = nextLyricsDraftQuota(state, SESSION, NOW);
      assert.equal(decision.ok, true);
      if (decision.ok) state = decision.state;
    }
    const blocked = nextLyricsDraftQuota(state, SESSION, NOW + 1000);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.reason, 'session');

    const later = nextLyricsDraftQuota(state, SESSION, NOW + 6 * 60 * 60 * 1000 + 1);
    assert.equal(later.ok, true);

    let day: LyricsQuotaState | null = null;
    for (let i = 0; i < LYRICS_DRAFTS_PER_DAY; i += 1) {
      const decision = nextLyricsDraftQuota(day, `session-${i}`, NOW);
      assert.equal(decision.ok, true);
      if (decision.ok) day = decision.state;
    }
    const over = nextLyricsDraftQuota(day, 'session-extra', NOW + 1000);
    assert.equal(over.ok, false);
    if (!over.ok) assert.equal(over.reason, 'day');
    const nextDay = nextLyricsDraftQuota(day, 'session-extra', NOW + 24 * 60 * 60 * 1000);
    assert.equal(nextDay.ok, true);
  });

  it('keeps the lyrics generator on documented v1 even when create is v2', () => {
    assert.equal(
      musicGptPromptToLyricsUrl('https://api.musicgpt.com/api/public/v2/MusicAI'),
      'https://api.musicgpt.com/api/public/v1/prompt_to_lyrics'
    );
    assert.equal(
      musicGptPromptToLyricsUrl('https://api.musicgpt.com'),
      'https://api.musicgpt.com/api/public/v1/prompt_to_lyrics'
    );
  });
});

function postDraft(body: unknown, authorization?: string) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (authorization) headers.set('authorization', authorization);
  return new NextRequest('https://streamstar.xyz/api/lyrics/draft', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/lyrics/draft', { concurrency: false }, () => {
  it('requires Firebase auth', async () => {
    let calls = 0;
    setLyricsDraftDepsForTests({
      verifyToken: async () => ({ uid: 'alice' }),
      createLyrics: async () => {
        calls += 1;
        return '[Verse]\nHi';
      },
    });
    const response = await POST(postDraft({ sessionId: SESSION, prompt: 'a song' }));
    assert.equal(response.status, 401);
    assert.equal(calls, 0);
  });

  it('builds a prompt from the artist when the box is empty', async () => {
    const seen: string[] = [];
    setLyricsDraftDepsForTests({
      verifyToken: async () => ({ uid: 'alice' }),
      getArtist: async () => artist(),
      reserve: async () => ({
        ok: true,
        remaining: 2,
        state: { dayKey: '2026-11-10', dayCount: 1, sessions: {} },
      }),
      createLyrics: async prompt => {
        seen.push(prompt);
        return '[Verse]\nStay';
      },
    });
    const response = await POST(
      postDraft({ sessionId: SESSION, prompt: '   ', artistId: 'artist-1' }, 'Bearer good')
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.lyrics, '[Verse]\nStay');
    assert.equal(body.remaining, 2);
    assert.equal(seen.length, 1);
    assert.match(seen[0], /Nova/);
    assert.match(seen[0], /pop/);
    assert.match(seen[0], /chill/);
    assert.equal(seen[0].startsWith(' '), false);
  });

  it('stops the fourth draft in one session', async () => {
    let state: LyricsQuotaState | null = null;
    let calls = 0;
    setLyricsDraftDepsForTests({
      verifyToken: async () => ({ uid: 'alice' }),
      now: () => NOW,
      reserve: async (_uid, sessionId, nowMs) => {
        const decision = nextLyricsDraftQuota(state, sessionId, nowMs);
        if (decision.ok) state = decision.state;
        return decision;
      },
      createLyrics: async () => {
        calls += 1;
        return '[Chorus]\nAgain';
      },
    });
    for (let i = 0; i < 3; i += 1) {
      const response = await POST(
        postDraft({ sessionId: SESSION, prompt: 'a hopeful song' }, 'Bearer good')
      );
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.remaining, 2 - i);
    }
    const blocked = await POST(
      postDraft({ sessionId: SESSION, prompt: 'a hopeful song' }, 'Bearer good')
    );
    assert.equal(blocked.status, 429);
    const body = await blocked.json();
    assert.equal(body.remaining, 0);
    assert.equal(body.reason, 'session');
    assert.equal(calls, 3);
  });
});
