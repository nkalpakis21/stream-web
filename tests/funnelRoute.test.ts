import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { POST as postArtistFunnel, setArtistFunnelTestHooks } from '../lib/server/artistFunnelHandler';
import {
  POST,
  resetFunnelRateLimitForTests,
  setFunnelNowForTests,
  setFunnelRouteAuthForTests,
} from '../lib/server/funnelRouteHandler';
import { FUNNEL_PLATFORM_HEADER } from '../lib/funnel/platform';
import { PLAY_REPEAT_WINDOW_MS, setFunnelStoreForTests, type FunnelStore } from '../lib/server/funnel';

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
  platformHeader?: string
): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  if (platformHeader) headers.set(FUNNEL_PLATFORM_HEADER, platformHeader);
  return new NextRequest('https://streamstar.xyz/api/funnel', {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  setFunnelStoreForTests(null);
  setFunnelRouteAuthForTests(null);
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

    for (const event of ['signed_up', 'artist_created', 'face_set', 'first_song_ready', 'first_play', 'x_connected', 'nope']) {
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
