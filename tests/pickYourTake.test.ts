import './render-setup';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { POST } from '../app/api/songs/[id]/take/route';
import { setSongTakeAuthForTests } from '../lib/server/songTake';
import { setAdminDbForTests } from '../lib/firebase/admin';
import { COLLECTIONS } from '../lib/firebase/collections';
import { FUNNEL_PLATFORM_HEADER } from '../lib/funnel/platform';
import {
  isClientFunnelEvent,
  isFunnelEvent,
  setFunnelStoreForTests,
  type FunnelStore,
} from '../lib/server/funnel';
import {
  CURRENT_TAKE_LABEL,
  PICK_TAKE_TITLE,
  SWITCH_TAKE_ERROR,
  SWITCH_TAKE_LABEL,
  SWITCHING_TAKE_LABEL,
  TAKE_1_LABEL,
  TAKE_2_FAILED,
  TAKE_2_LABEL,
  TAKE_2_PENDING,
  USE_TAKE_LABEL,
  buildTakeSlots,
  songHasTwoTakes,
  changedFromDefault,
  conversionIdsAfterLateTake,
  listenerVersions,
  shouldShowTakePicker,
  takeSeedFromParts,
  type TakeSlot,
} from '../lib/songs/takes';

process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-key';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'test-project';
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = '1:1:web:test';

type DocData = Record<string, unknown>;

function memoryDb() {
  const tables = new Map<string, Map<string, DocData>>();
  const refs = new Map<string, {
    id: string;
    get: () => Promise<{ id: string; exists: boolean; data: () => DocData | undefined; ref: unknown }>;
    set: (data: DocData, options?: { merge?: boolean }) => Promise<void>;
    update: (data: DocData) => Promise<void>;
  }>();

  function rows(name: string) {
    let table = tables.get(name);
    if (!table) {
      table = new Map();
      tables.set(name, table);
    }
    return table;
  }

  function compare(a: unknown, b: unknown): number {
    const value = (item: unknown): number | string => {
      if (item && typeof item === 'object' && 'toMillis' in item) {
        const ms = (item as { toMillis: () => number }).toMillis();
        if (Number.isFinite(ms)) return ms;
      }
      if (typeof item === 'number') return item;
      if (typeof item === 'string') return item;
      return 0;
    };
    const av = value(a);
    const bv = value(b);
    if (typeof av === 'number' && typeof bv === 'number') return av - bv;
    return String(av).localeCompare(String(bv));
  }

  function docRef(name: string, id: string) {
    const key = `${name}/${id}`;
    const existing = refs.get(key);
    if (existing) return existing;
    const ref = {
      id,
      async get() {
        const data = rows(name).get(id);
        return {
          id,
          exists: data !== undefined,
          data: () => (data ? { ...data } : undefined),
          ref,
        };
      },
      async set(data: DocData, options?: { merge?: boolean }) {
        if (options?.merge && rows(name).has(id)) rows(name).set(id, { ...rows(name).get(id), ...data });
        else rows(name).set(id, { ...data });
      },
      async update(data: DocData) {
        const current = rows(name).get(id);
        if (!current) throw new Error(`missing ${name}/${id}`);
        rows(name).set(id, { ...current, ...data });
      },
    };
    refs.set(key, ref);
    return ref;
  }

  function query(
    name: string,
    filters: Array<{ field: string; value: unknown }>,
    orderField: string | null,
    direction: 'asc' | 'desc'
  ) {
    return {
      where(field: string, op: string, value: unknown) {
        if (op !== '==') throw new Error(`unsupported op ${op}`);
        return query(name, [...filters, { field, value }], orderField, direction);
      },
      orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
        return query(name, filters, field, dir);
      },
      limit() {
        return this;
      },
      async get() {
        let entries = [...rows(name).entries()].filter(([, data]) =>
          filters.every((filter) => data[filter.field] === filter.value)
        );
        if (orderField) {
          const field = orderField;
          entries.sort((left, right) => {
            const cmp = compare(left[1][field], right[1][field]);
            return direction === 'desc' ? -cmp : cmp;
          });
        }
        const docs = entries.map(([id]) => {
          const ref = docRef(name, id);
          return { id, ref, data: () => ({ ...rows(name).get(id)! }) };
        });
        return { empty: docs.length === 0, size: docs.length, docs };
      },
    };
  }

  return {
    db: {
      collection(name: string) {
        return {
          doc(id?: string) {
            return docRef(name, id ?? `auto-${rows(name).size + 1}`);
          },
          where(field: string, op: string, value: unknown) {
            return query(name, [], null, 'asc').where(field, op, value);
          },
          orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
            return query(name, [], field, dir);
          },
        };
      },
      batch() {
        const ops: Array<() => Promise<void>> = [];
        return {
          update(ref: { update: (data: DocData) => Promise<void> }, data: DocData) {
            ops.push(() => ref.update(data));
          },
          async commit() {
            for (const op of ops) await op();
          },
        };
      },
    },
    async put(name: string, id: string, data: DocData) {
      await docRef(name, id).set(data);
    },
    read(name: string, id: string) {
      return rows(name).get(id);
    },
  };
}

function funnelMemory() {
  const docs: Array<{ id: string; data: Record<string, unknown> }> = [];
  const store: FunnelStore = {
    async create(id, data) {
      docs.push({ id, data });
    },
    async add(data) {
      docs.push({ id: `auto-${docs.length + 1}`, data });
    },
  };
  return { store, docs };
}

const now = Timestamp.fromMillis(1_700_000_000_000);

function song(extra?: DocData): DocData {
  return {
    id: 'song-1',
    ownerId: 'owner-1',
    artistId: 'artist-1',
    artistVersionId: 'av-1',
    title: 'Night Drive',
    isPublic: true,
    audioReady: true,
    playCount: 9,
    albumCoverPath: 'covers/night.jpg',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    currentVersionId: 'ver-1',
    parentSongId: null,
    collaborationType: null,
    albumCoverThumbnail: null,
    ...extra,
  };
}

function version(id: string, conversionId: string, primary: boolean, number: number): DocData {
  return {
    id,
    songId: 'song-1',
    versionNumber: number,
    title: 'Night Drive',
    createdBy: 'owner-1',
    audioURL: `https://cdn.example/${conversionId}.mp3`,
    providerOutputId: conversionId,
    isPrimary: primary,
    createdAt: now,
    parentVersionId: null,
  };
}

async function seedTakes(memory: ReturnType<typeof memoryDb>) {
  await memory.put(COLLECTIONS.songs, 'song-1', song());
  await memory.put(COLLECTIONS.songVersions, 'ver-1', version('ver-1', 'conv-a', true, 1));
  await memory.put(COLLECTIONS.songVersions, 'ver-2', version('ver-2', 'conv-b', false, 2));
  await memory.put(COLLECTIONS.generations, 'gen-1', {
    id: 'gen-1',
    songId: 'song-1',
    provider: 'musicgpt',
    status: 'completed',
    providerConversionIds: ['conv-a', 'conv-b'],
    providerProcessedConversions: ['conv-a', 'conv-b'],
    providerFailedConversions: [],
    createdAt: now,
  });
  setAdminDbForTests(memory.db);
}

function postTake(body: unknown, uid?: string) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (uid) {
    headers.set('authorization', 'Bearer test-token');
    headers.set(FUNNEL_PLATFORM_HEADER, 'web');
  }
  return new NextRequest('https://streamstar.xyz/api/songs/song-1/take', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  setAdminDbForTests(null);
  setFunnelStoreForTests(null);
  setSongTakeAuthForTests(null);
});

describe('take slots', () => {
  it('keeps Take 1 current, shows a pending or failed Take 2, and hides the other take from listeners', () => {
    assert.equal(PICK_TAKE_TITLE, 'Pick your favorite take');
    assert.equal(TAKE_1_LABEL, 'Take 1');
    assert.equal(TAKE_2_LABEL, 'Take 2');
    assert.equal(CURRENT_TAKE_LABEL, 'Current');
    assert.equal(USE_TAKE_LABEL, 'Use this take');
    assert.equal(TAKE_2_PENDING, 'Take 2 is still coming…');
    assert.equal(TAKE_2_FAILED, "Take 2 didn't come through.");
    assert.equal(SWITCH_TAKE_LABEL, 'Switch take');
    assert.equal(SWITCHING_TAKE_LABEL, 'Switching…');
    assert.equal(SWITCH_TAKE_ERROR, "Couldn't switch takes.");
    assert.equal(songHasTwoTakes({ conversionIds: ['a', 'b'], versions: [] }), true);
    assert.equal(
      songHasTwoTakes({
        conversionIds: ['a'],
        versions: [
          { audioURL: 'https://cdn.example/a.mp3', providerOutputId: 'a' },
          { audioURL: 'https://cdn.example/b.mp3', providerOutputId: 'b' },
        ],
      }),
      true
    );
    assert.equal(
      songHasTwoTakes({
        conversionIds: ['a'],
        versions: [{ audioURL: 'https://cdn.example/a.mp3', providerOutputId: 'a' }],
      }),
      false
    );
    assert.equal(songHasTwoTakes({ conversionIds: [], versions: [{ audioURL: null }] }), false);
    assert.equal(changedFromDefault(1), false);
    assert.equal(changedFromDefault(2), true);
    assert.equal(isFunnelEvent('take_picked'), true);
    assert.equal(isClientFunnelEvent('take_picked'), false);

    const pending = buildTakeSlots(
      takeSeedFromParts({
        currentVersionId: 'ver-1',
        versions: [
          { id: 'shell', audioURL: null, versionNumber: 0 },
          { id: 'ver-1', audioURL: 'https://cdn.example/a.mp3', providerOutputId: 'conv-a', isPrimary: true, versionNumber: 1 },
        ],
        generations: [
          {
            provider: 'musicgpt',
            status: 'pending',
            providerConversionIds: ['conv-a', 'conv-b'],
            createdAtMs: 2,
          },
        ],
      })
    );
    assert.equal(shouldShowTakePicker(pending), true);
    assert.equal(pending?.[0].status, 'ready');
    assert.equal(pending?.[0].isCurrent, true);
    assert.equal(pending?.[1].status, 'pending');
    assert.equal(pending?.[1].label, 'Take 2');

    const failed = buildTakeSlots({
      currentVersionId: 'ver-1',
      conversionIds: ['conv-a', 'conv-b'],
      failedConversionIds: ['conv-b'],
      generationStatus: 'completed',
      versions: [
        { id: 'ver-1', audioURL: 'https://cdn.example/a.mp3', providerOutputId: 'conv-a', isPrimary: true },
      ],
    });
    assert.equal(failed?.[1].status, 'failed');
    assert.equal(failed?.[0].isCurrent, true);

    const heard = listenerVersions(
      [
        { id: 'ver-1', audioURL: 'https://cdn.example/a.mp3', isPrimary: true },
        { id: 'ver-2', audioURL: 'https://cdn.example/b.mp3', isPrimary: false },
      ],
      'ver-1'
    );
    assert.deepEqual(heard.map((version) => version.id), ['ver-1']);
    assert.deepEqual(conversionIdsAfterLateTake(['conv-a'], [{ providerOutputId: 'conv-a', versionNumber: 1 }], 'conv-b'), [
      'conv-a',
      'conv-b',
    ]);
  });
});

describe('pick your take rows', () => {
  const ready: [TakeSlot, TakeSlot] = [
    {
      take: 1,
      label: 'Take 1',
      status: 'ready',
      versionId: 'ver-1',
      audioUrl: 'https://cdn.example/a.mp3',
      isCurrent: true,
    },
    {
      take: 2,
      label: 'Take 2',
      status: 'ready',
      versionId: 'ver-2',
      audioUrl: 'https://cdn.example/b.mp3',
      isCurrent: false,
    },
  ];

  async function markup(
    slots: [TakeSlot, TakeSlot],
    selected: 1 | 2,
    extra?: { using?: boolean; error?: string }
  ) {
    const { PickYourTake } = await import('../components/songs/PickYourTake');
    return renderToStaticMarkup(
      createElement(PickYourTake, {
        slots,
        selected,
        onSelect: () => {},
        onUse: () => {},
        using: extra?.using,
        error: extra?.error,
        titleId: 'pick-title',
      })
    );
  }

  it('renders the current row, play orbs, scrubbers, and Use this take only on the other selected row', async () => {
    const current = await markup(ready, 1);
    assert.match(current, /Pick your favorite take/);
    assert.match(current, /Take 1/);
    assert.match(current, /Take 2/);
    assert.match(current, /Current/);
    assert.equal(current.includes('Use this take'), false);
    assert.match(current, /is-current/);
    assert.match(current, /aria-pressed="true"/);
    assert.match(current, /aria-pressed="false"/);
    assert.match(current, /aria-label="Play Take 1"/);
    assert.match(current, /aria-label="Play Take 2"/);
    assert.match(current, /song-play-orb/);
    assert.match(current, /take-scrub/);
    assert.match(current, /aria-label="Take 1 scrubber"/);
    assert.equal(current.includes('animate-spin'), false);

    const picked = await markup(ready, 2);
    assert.match(picked, /Use this take/);
    assert.match(picked, /take-use/);
    assert.match(picked, /is-selected/);
    assert.match(picked, /is-current/);
    const useButtons = picked.split('take-use').length - 1;
    assert.equal(useButtons, 1);

    const busy = await markup(ready, 2, { using: true });
    assert.match(busy, /Switching…/);
    assert.match(busy, /disabled/);
    assert.equal(busy.includes('Use this take'), false);

    const failedSwitch = await markup(ready, 2, { error: SWITCH_TAKE_ERROR });
    assert.match(failedSwitch, /Couldn&#x27;t switch takes\./);
    assert.match(failedSwitch, /take-error/);
    assert.match(failedSwitch, /role="alert"/);

    const waiting = await markup(
      [ready[0], { ...ready[1], status: 'pending', versionId: null, audioUrl: null }],
      1
    );
    assert.match(waiting, /Take 2 is still coming…/);
    assert.equal(waiting.includes('animate-spin'), false);
    assert.equal(waiting.includes('Retry'), false);
    assert.match(waiting, /aria-label="Play Take 1"/);

    const missed = await markup(
      [ready[0], { ...ready[1], status: 'failed', versionId: null, audioUrl: null }],
      1
    );
    assert.match(missed, /Take 2 didn&#x27;t come through\./);
    assert.equal(missed.includes('Retry'), false);
    assert.equal(missed.includes('Use this take'), false);

    const css = readFileSync('components/songs/pick-your-take.css', 'utf8');
    assert.match(css, /\.take-row\.is-selected\s*\{[^}]*border-color:\s*#2a2a38/i);
    assert.match(css, /\.take-row\.is-current\s*\{[^}]*border-color:\s*#e8e6f2/i);
    assert.match(css, /\.take-error\s*\{[^}]*color:\s*#ff4d6a/i);
    assert.match(css, /\.take-sheet-close\s*\{[^}]*min-height:\s*44px/);
    assert.match(css, /\.take-use\s*\{[^}]*background:\s*#e8e6f2/i);
    assert.match(css, /\.take-use\s*\{[^}]*color:\s*#0a0a10/i);
    assert.match(css, /\.take-current-tag[\s\S]*?#8b8896/i);
    assert.match(css, /\.take-scrub\s*\{[^}]*height:\s*12px/);
    assert.match(css, /min-height:\s*44px/);
  });

  it('puts Switch take on the owner song row only', async () => {
    const [{ SongCard }, { SongPlayerStaticProvider }] = await Promise.all([
      import('../components/songs/SongCard'),
      import('../components/songs/SongPlayerProvider'),
    ]);
    const song = {
      id: 'song-1',
      title: 'Night Drive',
      artistId: 'artist-1',
      ownerId: 'owner-1',
      isPublic: true,
      deletedAt: null,
      currentVersionId: 'ver-1',
      artistVersionId: 'av-1',
    };
    const htmlFor = (ownerCatalog: boolean, takeCount: number) =>
      renderToStaticMarkup(
        createElement(
          SongPlayerStaticProvider,
          null,
          createElement(SongCard, {
            song: song as never,
            artistName: 'Nova',
            ownerCatalog,
            takeCount,
          })
        )
      );
    assert.match(htmlFor(true, 2), /Switch take/);
    assert.match(htmlFor(true, 2), /take-switch/);
    assert.equal(htmlFor(true, 1).includes('Switch take'), false);
    assert.equal(htmlFor(false, 2).includes('Switch take'), false);
    const sheet = readFileSync('components/songs/TakeSheet.tsx', 'utf8');
    assert.match(sheet, /aria-label="Close"/);
    assert.match(sheet, /take-sheet-close/);
    assert.match(sheet, /take-sheet-backdrop/);
    assert.match(sheet, /Escape/);
    const page = readFileSync('app/songs/[id]/page.tsx', 'utf8');
    assert.match(page, /listenerVersions\(/);
    assert.match(page, /SongTakesPanel/);
    assert.equal(page.includes('requireUser'), false);
  });
});

describe('POST /api/songs/[id]/take', () => {
  it('rejects anonymous callers, other users, and a version that is not a take', async () => {
    const memory = memoryDb();
    const funnel = funnelMemory();
    setFunnelStoreForTests(funnel.store);
    setSongTakeAuthForTests(async () => ({ uid: 'owner-2' }));
    await seedTakes(memory);

    const anon = await POST(postTake({ versionId: 'ver-2', msToPick: 10 }), { params: { id: 'song-1' } });
    assert.equal(anon.status, 401);

    setSongTakeAuthForTests(async () => ({ uid: 'owner-2' }));
    const stranger = await POST(postTake({ versionId: 'ver-2', msToPick: 10 }, 'owner-2'), {
      params: { id: 'song-1' },
    });
    assert.equal(stranger.status, 403);
    assert.equal(memory.read(COLLECTIONS.songs, 'song-1')?.currentVersionId, 'ver-1');

    setSongTakeAuthForTests(async () => ({ uid: 'owner-1' }));
    const badClock = await POST(postTake({ versionId: 'ver-2', msToPick: 1.5 }, 'owner-1'), {
      params: { id: 'song-1' },
    });
    assert.equal(badClock.status, 400);
    assert.equal(memory.read(COLLECTIONS.songs, 'song-1')?.currentVersionId, 'ver-1');
    assert.equal(funnel.docs.length, 0);

    const shell = await POST(postTake({ versionId: 'missing', msToPick: 10 }, 'owner-1'), {
      params: { id: 'song-1' },
    });
    assert.equal(shell.status, 400);
  });

  it('switches the current take for the owner and records take_picked without touching the song', async () => {
    const memory = memoryDb();
    const funnel = funnelMemory();
    setFunnelStoreForTests(funnel.store);
    setSongTakeAuthForTests(async () => ({ uid: 'owner-1' }));
    await seedTakes(memory);

    const switched = await POST(postTake({ versionId: 'ver-2', msToPick: 1500 }, 'owner-1'), {
      params: { id: 'song-1' },
    });
    assert.equal(switched.status, 200);
    assert.deepEqual(await switched.json(), { ok: true, take: 2, unchanged: false });

    const songDoc = memory.read(COLLECTIONS.songs, 'song-1');
    assert.equal(songDoc?.currentVersionId, 'ver-2');
    assert.equal(songDoc?.title, 'Night Drive');
    assert.equal(songDoc?.playCount, 9);
    assert.equal(songDoc?.albumCoverPath, 'covers/night.jpg');
    assert.equal(songDoc?.isPublic, true);
    assert.equal(songDoc?.ownerId, 'owner-1');
    assert.equal(memory.read(COLLECTIONS.songVersions, 'ver-1')?.isPrimary, false);
    assert.equal(memory.read(COLLECTIONS.songVersions, 'ver-2')?.isPrimary, true);
    assert.equal(memory.read(COLLECTIONS.songVersions, 'ver-2')?.audioURL, 'https://cdn.example/conv-b.mp3');

    assert.equal(funnel.docs.length, 1);
    assert.equal(funnel.docs[0]?.data.event, 'take_picked');
    assert.equal(funnel.docs[0]?.data.uid, 'owner-1');
    assert.equal(funnel.docs[0]?.data.platform, 'web');
    assert.deepEqual(funnel.docs[0]?.data.props, {
      songId: 'song-1',
      artistId: 'artist-1',
      take: 2,
      changedFromDefault: true,
      msToPick: 1500,
    });

    const again = await POST(postTake({ versionId: 'ver-2', msToPick: 20 }, 'owner-1'), {
      params: { id: 'song-1' },
    });
    assert.equal(again.status, 200);
    assert.equal((await again.json()).unchanged, true);
    assert.equal(funnel.docs.length, 1);

    const back = await POST(postTake({ versionId: 'ver-1', msToPick: 40 }, 'owner-1'), {
      params: { id: 'song-1' },
    });
    assert.equal(back.status, 200);
    assert.equal(memory.read(COLLECTIONS.songs, 'song-1')?.currentVersionId, 'ver-1');
    assert.equal(memory.read(COLLECTIONS.songVersions, 'ver-1')?.isPrimary, true);
    assert.equal(memory.read(COLLECTIONS.songVersions, 'ver-2')?.isPrimary, false);
    assert.equal(funnel.docs.length, 2);
    assert.deepEqual(funnel.docs[1]?.data.props, {
      songId: 'song-1',
      artistId: 'artist-1',
      take: 1,
      changedFromDefault: false,
      msToPick: 40,
    });
    assert.equal(memory.read(COLLECTIONS.songs, 'song-1')?.playCount, 9);
    assert.equal(memory.read(COLLECTIONS.songs, 'song-1')?.title, 'Night Drive');
  });
});
