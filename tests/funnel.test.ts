import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { FieldValue } from 'firebase-admin/firestore';
import {
  ARTIST_CREATED_WINDOW_MS,
  SIGNED_UP_WINDOW_MS,
  artistFunnelPlan,
  artistHasFace,
  funnelEventDocId,
  isClientFunnelEvent,
  isFunnelEvent,
  recordSignedUp,
  sanitizeFunnelProps,
  setFunnelCreationTimeForTests,
  setFunnelStoreForTests,
  shouldRecordSignedUp,
  trackFunnelEvent,
  type FunnelStore,
} from '../lib/server/funnel';
import { platformFromHeader, platformFromRequest } from '../lib/funnel/platform';
import {
  countFunnelRows,
  countPlatform,
  formatFunnelCounts,
  parseFunnelRange,
  parseUtcDayStart,
} from '../lib/server/funnelCounts';

const NOW = 1_700_000_000_000;

type Stored = { id: string; data: Record<string, unknown> };

function memoryStore() {
  const docs = new Map<string, Record<string, unknown>>();
  const store: FunnelStore = {
    async create(id, data) {
      if (docs.has(id)) {
        const error = new Error('ALREADY_EXISTS: document already exists') as Error & { code: number };
        error.code = 6;
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

afterEach(() => {
  setFunnelStoreForTests(null);
  setFunnelCreationTimeForTests(null);
});

describe('trackFunnelEvent', () => {
  it('rejects an unknown event and an unusable uid', async () => {
    const memory = memoryStore();
    setFunnelStoreForTests(memory.store);
    await assert.rejects(
      () => trackFunnelEvent('alice', 'page_view'),
      /Invalid funnel event/
    );
    await assert.rejects(
      () => trackFunnelEvent('alice', 'signed_up_twice'),
      /Invalid funnel event/
    );
    await assert.rejects(
      () => trackFunnelEvent('bad/uid', 'signed_up'),
      /Invalid funnel uid/
    );
    await assert.rejects(
      () => trackFunnelEvent('  ', 'play'),
      /Invalid funnel uid/
    );
    await assert.rejects(
      () => trackFunnelEvent('alice', 'play', undefined, 'server' as 'web'),
      /Invalid funnel platform/
    );
    assert.equal(memory.list().length, 0);
    assert.equal(isFunnelEvent('first_song_ready'), true);
    assert.equal(isFunnelEvent('play'), true);
    assert.equal(isFunnelEvent('first_play'), false);
    assert.equal(isClientFunnelEvent('play'), true);
    assert.equal(isClientFunnelEvent('signed_up'), false);
  });

  it('writes each event once per user and keeps only id props', async () => {
    const memory = memoryStore();
    setFunnelStoreForTests(memory.store);

    const first = await trackFunnelEvent(
      'alice',
      'first_song_started',
      {
        songId: 'song-1',
        taskId: 'task_1',
        artistId: 'artist-1',
        email: 'alice@example.com',
        note: 'hello',
        url: 'https://example.com/secret',
      },
      'ios'
    );
    const second = await trackFunnelEvent('alice', 'first_song_started', { songId: 'song-2' }, 'ios');
    const other = await trackFunnelEvent('alice', 'first_song_ready', { songId: 'song-1', artistId: 'artist-1' }, 'web');
    const playAgain = await trackFunnelEvent('alice', 'play', { songId: 'song-1' }, 'web');
    const playTwice = await trackFunnelEvent('alice', 'play', { songId: 'song-1' }, 'web');

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(other.created, true);
    assert.equal(playAgain.created, true);
    assert.equal(playTwice.created, true);
    const ids = memory.list().map(row => row.id).sort();
    assert.equal(ids.filter(id => id.startsWith('auto-')).length, 2);
    assert.equal(ids.includes('alice_first_song_started'), true);
    assert.equal(ids.includes('alice_first_song_ready'), true);

    const started = memory.list().find(row => row.id === 'alice_first_song_started');
    assert.equal(started?.data.uid, 'alice');
    assert.equal(started?.data.event, 'first_song_started');
    assert.equal(started?.data.platform, 'ios');
    const at = started?.data.at as { isEqual?: (value: unknown) => boolean };
    assert.equal(at?.isEqual?.(FieldValue.serverTimestamp()), true);
    assert.deepEqual(started?.data.props, {
      songId: 'song-1',
      taskId: 'task_1',
      artistId: 'artist-1',
    });
    assert.equal(JSON.stringify(started?.data).includes('alice@example.com'), false);
    assert.equal(JSON.stringify(started?.data).includes('https://'), false);
    assert.equal(funnelEventDocId('alice', 'first_song_started'), 'alice_first_song_started');
  });

  it('drops props that are not short ids', () => {
    assert.deepEqual(
      sanitizeFunnelProps({
        songId: 'song 1',
        artistId: 'a'.repeat(129),
        taskId: 'task.1',
        email: 'a@b.c',
      }),
      {}
    );
  });
});

describe('signed_up and artist milestones', () => {
  it('records signed_up only for a newly created Auth user', () => {
    assert.equal(shouldRecordSignedUp(NOW, NOW), true);
    assert.equal(shouldRecordSignedUp(NOW - SIGNED_UP_WINDOW_MS, NOW), true);
    assert.equal(shouldRecordSignedUp(NOW - SIGNED_UP_WINDOW_MS - 1, NOW), false);
    assert.equal(shouldRecordSignedUp(NOW + 6 * 60 * 1000, NOW), false);
    assert.equal(shouldRecordSignedUp(Number.NaN, NOW), false);
  });

  it('records signed_up from the creation-time lookup and ignores a repeat', async () => {
    const memory = memoryStore();
    setFunnelStoreForTests(memory.store);
    setFunnelCreationTimeForTests(async uid => (uid === 'new-user' ? Date.now() - 1_000 : 0));
    recordSignedUp('new-user');
    recordSignedUp('new-user');
    recordSignedUp('old-user');
    await new Promise(resolve => setTimeout(resolve, 20));
    const ids = memory.list().map(row => row.id);
    assert.deepEqual(ids, ['new-user_signed_up']);
    assert.equal(memory.list()[0]?.data.platform, 'unknown');
    assert.equal(memory.list()[0]?.data.event, 'signed_up');
  });

  it('plans artist_created for a new owned artist and face_set when a look is set', () => {
    const owned = artistFunnelPlan({
      uid: 'alice',
      ownerId: 'alice',
      deleted: false,
      createdAtMs: NOW - 1_000,
      hasFace: true,
      nowMs: NOW,
    });
    assert.deepEqual(owned, { artistCreated: true, faceSet: true });

    const old = artistFunnelPlan({
      uid: 'alice',
      ownerId: 'alice',
      deleted: false,
      createdAtMs: NOW - ARTIST_CREATED_WINDOW_MS - 1,
      hasFace: true,
      nowMs: NOW,
    });
    assert.deepEqual(old, { artistCreated: false, faceSet: true });

    const stranger = artistFunnelPlan({
      uid: 'bob',
      ownerId: 'alice',
      deleted: false,
      createdAtMs: NOW,
      hasFace: true,
      nowMs: NOW,
    });
    assert.deepEqual(stranger, { artistCreated: false, faceSet: false });

    const deleted = artistFunnelPlan({
      uid: 'alice',
      ownerId: 'alice',
      deleted: true,
      createdAtMs: NOW,
      hasFace: true,
      nowMs: NOW,
    });
    assert.deepEqual(deleted, { artistCreated: false, faceSet: false });
    assert.equal(artistHasFace('https://cdn.example/face.jpg'), true);
    assert.equal(artistHasFace('not a url'), false);
  });
});

describe('platform header', () => {
  it('stores web or ios only when the header is present and valid', () => {
    const request = (value?: string) => ({
      headers: { get: () => value ?? null },
    });
    assert.equal(platformFromRequest(request('web')), 'web');
    assert.equal(platformFromRequest(request(' iOS ')), 'ios');
    assert.equal(platformFromRequest(request()), 'unknown');
    assert.equal(platformFromRequest(request('')), 'unknown');
    assert.equal(platformFromRequest(request('android')), 'unknown');
    assert.equal(platformFromHeader(null), 'unknown');
    assert.equal(countPlatform('nope'), 'unknown');
    assert.equal(countPlatform(undefined), 'unknown');
  });
});

describe('funnel counts', () => {
  it('parses an inclusive UTC range and counts known events only', () => {
    assert.equal(parseUtcDayStart('2026-02-31'), null);
    assert.equal(parseFunnelRange('2026-02-02', '2026-02-01'), null);
    const range = parseFunnelRange('2026-01-01', '2026-01-02');
    assert.ok(range);
    const counts = countFunnelRows(
      [
        { event: 'signed_up', uid: 'alice', platform: 'web', atMs: range.fromMs },
        { event: 'signed_up', uid: 'bob', platform: 'ios', atMs: range.toMs },
        { event: 'signed_up', uid: 'cara', platform: 'web', atMs: range.toMs + 1 },
        { event: 'page_view', uid: 'alice', platform: 'web', atMs: range.fromMs },
        { event: 'play', uid: 'alice', platform: 'web', atMs: range.fromMs + 10 },
        { event: 'play', uid: 'alice', platform: 'web', atMs: range.fromMs + 20 },
        { event: 'play', uid: 'bob', atMs: range.fromMs + 30 },
        { event: 'song_shared', uid: 'alice', platform: 'ios', atMs: range.fromMs + 40 },
      ],
      range.fromMs,
      range.toMs
    );
    assert.equal(counts.signed_up.users, 2);
    assert.equal(counts.signed_up.events, 2);
    assert.equal(counts.play.events, 3);
    assert.equal(counts.play.users, 2);
    assert.equal(counts.song_shared.events, 1);
    assert.equal(counts.song_shared.users, 1);
    assert.equal(counts.artist_created.users, 0);
    const text = formatFunnelCounts({
      projectId: 'stream-dev-48098',
      from: '2026-01-01',
      to: '2026-01-02',
      counts,
    });
    assert.match(text, /^project=stream-dev-48098 from=2026-01-01 to=2026-01-02/);
    assert.match(text, /signed_up users=2 web_users=1 ios_users=1 unknown_users=0/);
    assert.match(text, /first_song_ready users=0 web_users=0 ios_users=0 unknown_users=0/);
    assert.match(
      text,
      /play events=3 users=2 web_events=2 web_users=1 ios_events=0 ios_users=0 unknown_events=1 unknown_users=1 source_none_events=3 source_none_users=2/
    );
    assert.match(
      text,
      /song_shared events=1 users=1 web_events=0 web_users=0 ios_events=1 ios_users=1 unknown_events=0 unknown_users=0/
    );
  });

  it('breaks plays down by source, counting a visitor when uid is null', () => {
    const range = parseFunnelRange('2026-03-01', '2026-03-01');
    assert.ok(range);
    const counts = countFunnelRows(
      [
        { event: 'play', uid: 'alice', platform: 'web', source: 'share_page', atMs: range.fromMs },
        {
          event: 'play',
          uid: null,
          visitorId: 'ssv_11111111-1111-4111-8111-111111111111',
          platform: 'web',
          source: 'share_page',
          atMs: range.fromMs + 1,
        },
        { event: 'play', uid: 'alice', platform: 'ios', atMs: range.fromMs + 2 },
      ],
      range.fromMs,
      range.toMs
    );
    assert.equal(counts.play.events, 3);
    assert.equal(counts.play.users, 1);
    assert.equal(counts.play.bySource.share_page?.events, 2);
    assert.equal(counts.play.bySource.share_page?.users, 2);
    assert.equal(counts.play.bySource.none?.events, 1);
    assert.equal(counts.play.bySource.none?.users, 1);
    const text = formatFunnelCounts({
      projectId: 'stream-dev-48098',
      from: '2026-03-01',
      to: '2026-03-01',
      counts,
    });
    assert.match(text, /source_none_events=1 source_none_users=1 source_share_page_events=2 source_share_page_users=2/);
  });
});
