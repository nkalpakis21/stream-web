import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { POST as postArtistFunnel, setArtistFunnelTestHooks } from '../lib/server/artistFunnelHandler';
import { POST } from '../lib/server/funnelRouteHandler';
import { FUNNEL_PLATFORM_HEADER } from '../lib/funnel/platform';
import { PLAY_REPEAT_WINDOW_MS, setFunnelStoreForTests, type FunnelStore } from '../lib/server/funnel';
import {
  resetFunnelRateLimitForTests,
  setFunnelNowForTests,
  setFunnelRouteAuthForTests,
  setFunnelSongLookupForTests,
  type FunnelSongRecord,
} from '../lib/server/funnelRouteHandler';

type Stored = { id: string; data: Record<string, unknown> };

function memoryStore() {
  const docs = new Map<string, Record<string, unknown>>();
  const store: FunnelStore = {
    async create(id, data) {
      if (docs.has(id)) {
        const error = new Error('already exists') as Error & { code: string };
        error.code = 'already-exists';
        throw error;
      }
      docs.set(id, { ...data });
    },
    async add(data) {
      docs.set(`auto-${docs.size + 1}`, { ...data });
    },
  };
  return {
    store,
    list(): Stored[] {
      return [...docs.entries()].map(([id, data]) => ({ id, data }));
    },
  };
}

function postFunnel(
  body: unknown,
  authorization?: string,
  platformHeader?: string,
  ip?: string
): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  if (platformHeader) headers.set(FUNNEL_PLATFORM_HEADER, platformHeader);
  if (ip) headers.set('x-forwarded-for', ip);
  return new NextRequest('https://streamstar.xyz/api/funnel', {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const VISITOR = 'ssv_11111111-1111-4111-8111-111111111111';

function publicSong(overrides?: Partial<FunnelSongRecord>): FunnelSongRecord {
  return {
    artistId: 'artist-1',
    isPublic: true,
    deletedAt: null,
    ownerId: 'owner-alice',
    audioReady: true,
    ...overrides,
  };
}

function visitorId(n: number): string {
  return `ssv_22222222-2222-4222-8222-${n.toString(16).padStart(12, '0')}`;
}

afterEach(() => {
  setFunnelStoreForTests(null);
  setFunnelRouteAuthForTests(null);
  setFunnelSongLookupForTests(null);
  setArtistFunnelTestHooks(null);
  resetFunnelRateLimitForTests();
  setFunnelNowForTests(null);
});

describe('POST /api/funnel', () => {
  it('requires a signed-in user and ignores a uid in the body', async () => {
    const memory = memoryStore();
    setFunnelStoreForTests(memory.store);
    setFunnelRouteAuthForTests(async () => ({ uid: 'alice' }));

    const missing = await POST(postFunnel({ event: 'play' }));
    assert.equal(missing.status, 401);

    const forged = await POST(
      postFunnel({ event: 'play', uid: 'bob', songId: 'song-1' }, 'Bearer token')
    );
    assert.equal(forged.status, 400);
    assert.equal(memory.list().length, 0);

    const response = await POST(
      postFunnel(
        { event: 'play', songId: 'song-1', artistId: 'artist-1' },
        'Bearer token'
      )
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.equal(memory.list().length, 1);
    assert.equal(memory.list()[0]?.data.uid, 'alice');
    assert.equal(memory.list()[0]?.data.event, 'play');
    assert.deepEqual(memory.list()[0]?.data.props, { songId: 'song-1', artistId: 'artist-1' });
    assert.equal(memory.list()[0]?.data.platform, 'unknown');
  });

  it('accepts only play and song_shared, and writes shares every time', async () => {
    const memory = memoryStore();
    setFunnelStoreForTests(memory.store);
    setFunnelRouteAuthForTests(async () => ({ uid: 'alice' }));

    for (const event of ['signed_up', 'artist_created', 'face_set', 'first_song_ready', 'first_play', 'x_connected', 'x_post', 'nope']) {
      const response = await POST(postFunnel({ event }, 'Bearer token'));
      assert.equal(response.status, 400, event);
    }
    const extra = await POST(
      postFunnel({ event: 'song_shared', email: 'a@b.c' }, 'Bearer token')
    );
    assert.equal(extra.status, 400);
    const badJson = await POST(postFunnel('{', 'Bearer token'));
    assert.equal(badJson.status, 400);
    assert.equal(memory.list().length, 0);

    const shared = await POST(
      postFunnel({ event: 'song_shared', songId: 'song-9', artistId: 'artist-9' }, 'Bearer token', 'ios')
    );
    assert.equal(shared.status, 200);
    const again = await POST(
      postFunnel({ event: 'song_shared', songId: 'song-10' }, 'Bearer token', 'ios')
    );
    assert.equal(again.status, 200);
    assert.equal(memory.list().length, 2);
    assert.equal(memory.list().every(row => row.data.event === 'song_shared'), true);
    assert.equal(memory.list().every(row => row.data.platform === 'ios'), true);
    assert.deepEqual(memory.list()[0]?.data.props, { songId: 'song-9', artistId: 'artist-9' });
  });

  it('ignores a second play of the same song inside 30 seconds', async () => {
    const memory = memoryStore();
    setFunnelStoreForTests(memory.store);
    setFunnelRouteAuthForTests(async () => ({ uid: 'alice' }));
    let now = 1_700_000_000_000;
    setFunnelNowForTests(() => now);

    const first = await POST(postFunnel({ event: 'play', songId: 'song-1' }, 'Bearer token'));
    const repeat = await POST(postFunnel({ event: 'play', songId: 'song-1' }, 'Bearer token'));
    const otherSong = await POST(postFunnel({ event: 'play', songId: 'song-2' }, 'Bearer token'));
    assert.equal(first.status, 200);
    assert.equal(repeat.status, 200);
    assert.equal(otherSong.status, 200);
    assert.equal(memory.list().length, 2);

    now += PLAY_REPEAT_WINDOW_MS;
    const later = await POST(postFunnel({ event: 'play', songId: 'song-1' }, 'Bearer token'));
    assert.equal(later.status, 200);
    assert.equal(memory.list().length, 3);
  });

  it('stores unknown when the platform header is missing or invalid', async () => {
    const memory = memoryStore();
    setFunnelStoreForTests(memory.store);
    setFunnelRouteAuthForTests(async () => ({ uid: 'alice' }));

    const missing = await POST(postFunnel({ event: 'song_shared', songId: 'song-1' }, 'Bearer token'));
    const invalid = await POST(
      postFunnel({ event: 'song_shared', songId: 'song-2' }, 'Bearer token', 'android')
    );
    const web = await POST(
      postFunnel({ event: 'song_shared', songId: 'song-3' }, 'Bearer token', 'web')
    );
    assert.equal(missing.status, 200);
    assert.equal(invalid.status, 200);
    assert.equal(web.status, 200);
    assert.deepEqual(
      memory.list().map(row => row.data.platform),
      ['unknown', 'unknown', 'web']
    );
  });

  it('stores a signed-in share-page play with source and ignores source on shares', async () => {
    const memory = memoryStore();
    setFunnelStoreForTests(memory.store);
    setFunnelRouteAuthForTests(async () => ({ uid: 'alice' }));

    const play = await POST(
      postFunnel(
        { event: 'play', songId: 'song-1', artistId: 'artist-1', source: 'share_page' },
        'Bearer token',
        'web'
      )
    );
    const shared = await POST(
      postFunnel({ event: 'song_shared', songId: 'song-1', source: 'share_page' }, 'Bearer token', 'web')
    );
    assert.equal(play.status, 200);
    assert.equal(shared.status, 200);
    assert.equal(memory.list()[0]?.data.uid, 'alice');
    assert.equal(memory.list()[0]?.data.source, 'share_page');
    assert.equal(memory.list()[0]?.data.visitorId, undefined);
    assert.equal(memory.list()[1]?.data.event, 'song_shared');
    assert.equal(memory.list()[1]?.data.source, undefined);
  });

  it('accepts an anonymous share-page play and rejects other anonymous events', async () => {
    const memory = memoryStore();
    setFunnelStoreForTests(memory.store);
    setFunnelSongLookupForTests(async songId =>
      songId === 'song-1' ? publicSong() : null
    );

    const share = await POST(
      postFunnel({ event: 'song_shared', songId: 'song-1', visitorId: VISITOR, source: 'share_page' }, undefined, 'web')
    );
    const milestone = await POST(postFunnel({ event: 'signed_up', visitorId: VISITOR }));
    assert.equal(share.status, 401);
    assert.equal(milestone.status, 400);

    const response = await POST(
      postFunnel(
        { event: 'play', songId: 'song-1', visitorId: VISITOR, source: 'share_page', artistId: 'forged' },
        undefined,
        'web',
        '203.0.113.10'
      )
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.equal(memory.list().length, 1);
    const stored = memory.list()[0]?.data;
    assert.equal(stored?.uid, null);
    assert.equal(stored?.visitorId, VISITOR);
    assert.equal(stored?.source, 'share_page');
    assert.equal(stored?.event, 'play');
    assert.equal(stored?.platform, 'web');
    assert.equal(stored?.songId, 'song-1');
    assert.equal(stored?.artistId, 'artist-1');
    assert.deepEqual(stored?.props, { songId: 'song-1', artistId: 'artist-1' });
    assert.equal(JSON.stringify(stored).includes('forged'), false);
  });

  it('rejects a malformed visitor id and a song that is not publicly playable', async () => {
    const memory = memoryStore();
    setFunnelStoreForTests(memory.store);
    setFunnelSongLookupForTests(async songId => {
      if (songId === 'song-private') return publicSong({ isPublic: false });
      if (songId === 'song-deleted') return publicSong({ deletedAt: 1 });
      if (songId === 'song-pending') return publicSong({ audioReady: false });
      if (songId === 'song-failed') return publicSong({ audioReady: true, generationStatus: 'failed' });
      return null;
    });

    for (const visitorId of ['visitor', 'ssv_nope', 'ssv_11111111-1111-3111-8111-111111111111', `ssv_${'a'.repeat(40)}`]) {
      const response = await POST(
        postFunnel({ event: 'play', songId: 'song-1', visitorId, source: 'share_page' })
      );
      assert.equal(response.status, 400, visitorId);
      assert.equal((await response.json()).error, 'Invalid visitor');
    }

    const missingSong = await POST(
      postFunnel({ event: 'play', songId: 'song-missing', visitorId: VISITOR, source: 'share_page' })
    );
    const privateSong = await POST(
      postFunnel({ event: 'play', songId: 'song-private', visitorId: VISITOR, source: 'share_page' })
    );
    const deleted = await POST(
      postFunnel({ event: 'play', songId: 'song-deleted', visitorId: VISITOR, source: 'share_page' })
    );
    const pending = await POST(
      postFunnel({ event: 'play', songId: 'song-pending', visitorId: VISITOR, source: 'share_page' })
    );
    const failed = await POST(
      postFunnel({ event: 'play', songId: 'song-failed', visitorId: VISITOR, source: 'share_page' })
    );
    for (const response of [missingSong, privateSong, deleted, pending, failed]) {
      assert.equal(response.status, 404);
      const body = await response.json();
      assert.deepEqual(body, { error: 'Song not found' });
      assert.equal(JSON.stringify(body).includes('Seed'), false);
    }
    assert.equal(memory.list().length, 0);
  });

  it('dedupes an anonymous song for 30 seconds and caps plays per visitor and per IP', async () => {
    const memory = memoryStore();
    setFunnelStoreForTests(memory.store);
    setFunnelSongLookupForTests(async () => publicSong());
    let now = 1_700_000_000_000;
    setFunnelNowForTests(() => now);

    const first = await POST(
      postFunnel({ event: 'play', songId: 'song-1', visitorId: VISITOR, source: 'share_page' }, undefined, 'web', '203.0.113.20')
    );
    const repeat = await POST(
      postFunnel({ event: 'play', songId: 'song-1', visitorId: VISITOR, source: 'share_page' }, undefined, 'web', '203.0.113.20')
    );
    assert.equal(first.status, 200);
    assert.equal(repeat.status, 200);
    assert.equal(memory.list().length, 1);

    now += PLAY_REPEAT_WINDOW_MS;
    const later = await POST(
      postFunnel({ event: 'play', songId: 'song-1', visitorId: VISITOR, source: 'share_page' }, undefined, 'web', '203.0.113.21')
    );
    assert.equal(later.status, 200);
    assert.equal(memory.list().length, 2);

    resetFunnelRateLimitForTests();
    memory.list().splice(0, memory.list().length);
    const fresh = memoryStore();
    setFunnelStoreForTests(fresh.store);
    for (let i = 0; i < 60; i += 1) {
      const response = await POST(
        postFunnel(
          { event: 'play', songId: `song-v-${i}`, visitorId: VISITOR, source: 'share_page' },
          undefined,
          'web',
          `203.0.113.${i + 1}`
        )
      );
      assert.equal(response.status, 200, `visitor play ${i}`);
    }
    const visitorBlocked = await POST(
      postFunnel(
        { event: 'play', songId: 'song-v-60', visitorId: VISITOR, source: 'share_page' },
        undefined,
        'web',
        '198.51.100.9'
      )
    );
    assert.equal(visitorBlocked.status, 429);
    assert.equal(fresh.list().length, 60);

    resetFunnelRateLimitForTests();
    const byIp = memoryStore();
    setFunnelStoreForTests(byIp.store);
    for (let i = 0; i < 60; i += 1) {
      const response = await POST(
        postFunnel(
          { event: 'play', songId: `song-ip-${i}`, visitorId: visitorId(i + 1), source: 'share_page' },
          undefined,
          'web',
          '203.0.113.50'
        )
      );
      assert.equal(response.status, 200, `ip play ${i}`);
    }
    const ipBlocked = await POST(
      postFunnel(
        { event: 'play', songId: 'song-ip-60', visitorId: visitorId(61), source: 'share_page' },
        undefined,
        'web',
        '203.0.113.50'
      )
    );
    assert.equal(ipBlocked.status, 429);
    assert.equal(byIp.list().length, 60);
  });
});

describe('POST /api/artists/[id]/funnel', () => {
  function postArtist(id = 'artist-1'): NextRequest {
    return new NextRequest(`https://streamstar.xyz/api/artists/${id}/funnel`, {
      method: 'POST',
      headers: { authorization: 'Bearer token' },
    });
  }

  it('records artist_created and face_set only for the owner of a new artist', async () => {
    const memory = memoryStore();
    setFunnelStoreForTests(memory.store);
    const now = Date.now();
    setArtistFunnelTestHooks({
      verifyToken: async () => ({ uid: 'alice' }),
      readArtist: async () => ({
        ownerId: 'alice',
        deletedAt: null,
        createdAt: { toMillis: () => now - 1_000 },
        avatarURL: 'https://cdn.example/face.jpg',
      }),
    });

    const response = await postArtistFunnel(postArtist(), { params: { id: 'artist-1' } });
    assert.equal(response.status, 200);
    await new Promise(resolve => setTimeout(resolve, 0));
    const ids = memory.list().map(row => row.id).sort();
    assert.deepEqual(ids, ['alice_artist_created', 'alice_face_set']);
    assert.equal(
      memory.list().every(row => (row.data.props as { artistId: string }).artistId === 'artist-1'),
      true
    );
  });

  it('does not record another user\'s artist or an old artist as created', async () => {
    const memory = memoryStore();
    setFunnelStoreForTests(memory.store);
    setArtistFunnelTestHooks({
      verifyToken: async () => ({ uid: 'bob' }),
      readArtist: async () => ({
        ownerId: 'alice',
        deletedAt: null,
        createdAt: { toMillis: () => Date.now() },
        avatarURL: 'https://cdn.example/face.jpg',
      }),
    });
    const denied = await postArtistFunnel(postArtist(), { params: { id: 'artist-1' } });
    assert.equal(denied.status, 404);

    setArtistFunnelTestHooks({
      verifyToken: async () => ({ uid: 'alice' }),
      readArtist: async () => ({
        ownerId: 'alice',
        deletedAt: null,
        createdAt: { toMillis: () => Date.now() - 3 * 60 * 60 * 1000 },
        avatarURL: null,
      }),
    });
    const old = await postArtistFunnel(postArtist(), { params: { id: 'artist-1' } });
    assert.equal(old.status, 200);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(memory.list().length, 0);
  });
});

describe('POST /api/funnel create milestones', () => {
  it('requires sign-in and rejects face_set skip or none', async () => {
    const memory = memoryStore();
    setFunnelStoreForTests(memory.store);
    setFunnelRouteAuthForTests(async () => ({ uid: 'alice' }));

    const loggedOut = await POST(postFunnel({ event: 'create_started' }));
    assert.equal(loggedOut.status, 401);

    for (const method of ['skip', 'none', 'photo']) {
      const response = await POST(
        postFunnel({ event: 'face_set', method }, 'Bearer token')
      );
      assert.equal(response.status, 400, method);
      assert.equal((await response.json()).error, 'Invalid funnel event');
    }
    const missing = await POST(postFunnel({ event: 'face_set' }, 'Bearer token'));
    assert.equal(missing.status, 400);

    const upload = await POST(postFunnel({ event: 'face_set', method: 'upload' }, 'Bearer token', 'web'));
    const generate = await POST(postFunnel({ event: 'face_set', method: 'generate' }, 'Bearer token'));
    assert.equal(upload.status, 200);
    assert.equal(generate.status, 200);
    const stored = memory.list().find(row => row.id === 'alice_face_set');
    assert.equal(stored?.data.event, 'face_set');
    assert.deepEqual(stored?.data.props, { method: 'upload' });

    const started = await POST(postFunnel({ event: 'create_started' }, 'Bearer token', 'web'));
    assert.equal(started.status, 200);
    assert.equal(memory.list().some(row => row.id === 'alice_create_started'), true);

    const skippedFace = await POST(
      postFunnel({ event: 'create_submitted', face: 'skip' }, 'Bearer token')
    );
    assert.equal(skippedFace.status, 400);
    const submitted = await POST(
      postFunnel({ event: 'create_submitted', face: 'none' }, 'Bearer token', 'ios')
    );
    assert.equal(submitted.status, 200);
    const created = memory.list().find(row => row.id === 'alice_create_submitted');
    assert.deepEqual(created?.data.props, { face: 'none' });
    assert.equal(created?.data.platform, 'ios');
  });
});
