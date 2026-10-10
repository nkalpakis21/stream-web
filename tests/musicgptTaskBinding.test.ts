import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/generations/musicgpt/route';
import { setAdminDbForTests } from '../lib/firebase/admin';
import { COLLECTIONS } from '../lib/firebase/collections';
import {
  setMusicGptGenerationDepsForTests,
  type MusicGptGenerationDeps,
} from '../lib/server/musicgptGeneration';
import { processMusicGptWebhook } from '../lib/server/musicgptWebhook';
import {
  LEGACY_UNBOUND_WINDOW_MS,
  MUSICGPT_TASK_TTL_MS,
  musicGptTaskBindingFields,
  musicGptTaskLogId,
  resolveMusicGptGeneration,
  type GenerationCandidate,
  type MusicGptTaskBinding,
} from '../lib/server/musicgptTaskBinding';
import type { GenerationDocument, SongDocument } from '../types/firestore';

const TASK_ID = 'task-bound-1';
const CONVERSION_ID = 'conv-1';
const AUDIO_URL = 'https://cdn.example/victim.mp3';
const NOW_MS = 1_700_000_000_000;

type DocData = Record<string, unknown>;

type DocRef = {
  id: string;
  get: () => Promise<{
    id: string;
    exists: boolean;
    data: () => DocData | undefined;
    ref: DocRef;
  }>;
  set: (data: DocData, options?: { merge?: boolean }) => Promise<void>;
  update: (data: DocData) => Promise<void>;
  create: (data: DocData) => Promise<void>;
};

function createMemoryAdminDb() {
  const tables = new Map<string, Map<string, DocData>>();
  let seq = 0;

  function rowsFor(name: string): Map<string, DocData> {
    let rows = tables.get(name);
    if (!rows) {
      rows = new Map();
      tables.set(name, rows);
    }
    return rows;
  }

  function docRef(name: string, id: string): DocRef {
    const rows = rowsFor(name);
    const ref: DocRef = {
      id,
      async get() {
        const data = rows.get(id);
        return {
          id,
          exists: data !== undefined,
          data: () => (data ? { ...data } : undefined),
          ref,
        };
      },
      async set(data, options) {
        if (options?.merge && rows.has(id)) {
          rows.set(id, { ...rows.get(id), ...data });
        } else {
          rows.set(id, { ...data });
        }
      },
      async update(data) {
        const current = rows.get(id);
        if (!current) throw new Error(`No document to update: ${name}/${id}`);
        rows.set(id, { ...current, ...data });
      },
      async create(data) {
        if (rows.has(id)) {
          const error = new Error('already exists') as Error & { code: number };
          error.code = 6;
          throw error;
        }
        rows.set(id, { ...data });
      },
    };
    return ref;
  }

  function query(
    name: string,
    filters: Array<{ field: string; value: unknown }>,
    orderField: string | null,
    direction: 'asc' | 'desc',
    limitN: number | null
  ) {
    return {
      where(field: string, op: string, value: unknown) {
        if (op !== '==') throw new Error(`unsupported op ${op}`);
        return query(name, [...filters, { field, value }], orderField, direction, limitN);
      },
      orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
        return query(name, filters, field, dir, limitN);
      },
      limit(n: number) {
        return query(name, filters, orderField, direction, n);
      },
      async get() {
        let entries = [...rowsFor(name).entries()].filter(([, data]) =>
          filters.every((filter) => data[filter.field] === filter.value)
        );
        if (orderField) {
          const field = orderField;
          entries.sort((left, right) => {
            const av = left[1][field];
            const bv = right[1][field];
            const an = typeof av === 'number' ? av : 0;
            const bn = typeof bv === 'number' ? bv : 0;
            return direction === 'desc' ? bn - an : an - bn;
          });
        }
        if (limitN != null) entries = entries.slice(0, limitN);
        const docs = entries.map(([id]) => {
          const ref = docRef(name, id);
          return {
            id,
            ref,
            data: () => ({ ...rowsFor(name).get(id)! }),
          };
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
            return docRef(name, id ?? `auto-${++seq}`);
          },
          where(field: string, op: string, value: unknown) {
            return query(name, [], null, 'asc', null).where(field, op, value);
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
    list(name: string) {
      return [...rowsFor(name).entries()].map(([id, data]) => ({ id, data: { ...data } }));
    },
  };
}

function song(partial: Pick<SongDocument, 'id' | 'ownerId' | 'title'>): SongDocument {
  const now = Timestamp.fromMillis(0);
  return {
    id: partial.id,
    ownerId: partial.ownerId,
    artistId: 'artist-1',
    artistVersionId: 'av-1',
    title: partial.title,
    isPublic: true,
    createdAt: now as unknown as SongDocument['createdAt'],
    updatedAt: now as unknown as SongDocument['updatedAt'],
    deletedAt: null,
    currentVersionId: '',
    parentSongId: null,
    collaborationType: null,
    albumCoverPath: null,
    albumCoverThumbnail: null,
  };
}

function generation(partial: {
  id: string;
  songId: string;
  taskId: string;
  createdAt: Timestamp;
}): GenerationDocument {
  return {
    id: partial.id,
    songId: partial.songId,
    artistVersionId: 'av-1',
    songVersionId: null,
    prompt: { structured: {}, freeText: 'a song' },
    parameters: {},
    provider: 'musicgpt',
    status: 'pending',
    providerTaskId: partial.taskId,
    providerConversionIds: [CONVERSION_ID],
    providerProcessedConversions: [],
    output: { audioURL: null, stems: null, metadata: {} },
    error: null,
    createdAt: partial.createdAt as unknown as GenerationDocument['createdAt'],
    completedAt: null,
    contentHash: null,
  };
}

function candidate(
  generationDoc: GenerationDocument,
  songOwnerId: string | null
): GenerationCandidate {
  return { id: generationDoc.id, generation: generationDoc, songOwnerId };
}

function binding(partial: Partial<MusicGptTaskBinding> & Pick<MusicGptTaskBinding, 'uid' | 'songId'>): MusicGptTaskBinding {
  return {
    uid: partial.uid,
    songId: partial.songId,
    conversionIds: partial.conversionIds ?? [CONVERSION_ID],
    createdAt: partial.createdAt ?? Timestamp.fromMillis(NOW_MS),
    expireAt: partial.expireAt ?? Timestamp.fromMillis(NOW_MS + MUSICGPT_TASK_TTL_MS),
  };
}

const savedEnv: Record<string, string | undefined> = {};

function rememberEnv(name: string) {
  if (!(name in savedEnv)) savedEnv[name] = process.env[name];
}

function setEnv(name: string, value: string | undefined) {
  rememberEnv(name);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  setAdminDbForTests(null);
  setMusicGptGenerationDepsForTests(null);
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

async function withWebhookDb<T>(
  run: (memory: ReturnType<typeof createMemoryAdminDb>, warnings: string[]) => Promise<T>
): Promise<T> {
  setEnv('MUSICGPT_BASE_URL', 'https://musicgpt.test');
  setEnv('MUSICGPT_API_KEY', 'test-musicgpt-key');
  setEnv('MUSICGPT_WEBHOOK_SECRET', 'webhook-secret');
  setEnv('COVER_PIPELINE', undefined);
  setEnv('X_CLIENT_ID', undefined);
  setEnv('X_CLIENT_SECRET', undefined);
  setEnv('NEXT_PUBLIC_APP_URL', undefined);

  const memory = createMemoryAdminDb();
  setAdminDbForTests(memory.db);
  const warnings: string[] = [];
  const originalWarn = console.warn;
  const originalFetch = globalThis.fetch;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };
  globalThis.fetch = (async () => new Response('no', { status: 404 })) as typeof fetch;
  try {
    return await run(memory, warnings);
  } finally {
    console.warn = originalWarn;
    globalThis.fetch = originalFetch;
    setAdminDbForTests(null);
  }
}

async function seed(
  memory: ReturnType<typeof createMemoryAdminDb>,
  input: {
    songs: SongDocument[];
    generations: GenerationDocument[];
    taskBinding?: MusicGptTaskBinding | null;
    taskId?: string;
  }
) {
  for (const item of input.songs) {
    await memory.db.collection(COLLECTIONS.songs).doc(item.id).set(item as unknown as DocData);
  }
  for (const item of input.generations) {
    await memory.db.collection(COLLECTIONS.generations).doc(item.id).set(item as unknown as DocData);
  }
  if (input.taskBinding) {
    await memory.db
      .collection(COLLECTIONS.musicgptTasks)
      .doc(input.taskId ?? TASK_ID)
      .set(input.taskBinding as unknown as DocData);
  }
}

function completionBody(taskId = TASK_ID) {
  return {
    success: true,
    conversion_type: 'MUSIC_AI',
    task_id: taskId,
    conversion_id: CONVERSION_ID,
    conversion_path: AUDIO_URL,
  };
}

function versionsFor(memory: ReturnType<typeof createMemoryAdminDb>, songId: string) {
  return memory
    .list(COLLECTIONS.songVersions)
    .filter((row) => row.data.songId === songId);
}

describe('MusicGPT task binding selection', () => {
  const insideWindow = Timestamp.fromMillis(NOW_MS - 60_000);
  const outsideWindow = Timestamp.fromMillis(NOW_MS - LEGACY_UNBOUND_WINDOW_MS);
  const victim = generation({
    id: 'gen-victim',
    songId: 'song-victim',
    taskId: TASK_ID,
    createdAt: insideWindow,
  });
  const attacker = generation({
    id: 'gen-attacker',
    songId: 'song-attacker',
    taskId: TASK_ID,
    createdAt: insideWindow,
  });

  it('accepts the generation owned by the bound uid and song', () => {
    const resolution = resolveMusicGptGeneration({
      taskId: TASK_ID,
      binding: binding({ uid: 'victim', songId: 'song-victim' }),
      bindingDocPresent: true,
      candidates: [candidate(victim, 'victim')],
    });
    assert.equal(resolution.mode, 'bound');
    assert.equal(resolution.accepted?.id, 'gen-victim');
    assert.equal(resolution.logMismatch, false);
    assert.equal(resolution.logUnbound, false);
  });

  it('rejects a copied task id on another owner and still accepts the real generation', () => {
    const resolution = resolveMusicGptGeneration({
      taskId: TASK_ID,
      binding: binding({ uid: 'victim', songId: 'song-victim' }),
      bindingDocPresent: true,
      candidates: [candidate(attacker, 'attacker'), candidate(victim, 'victim')],
    });
    assert.equal(resolution.accepted?.id, 'gen-victim');
    assert.equal(resolution.logMismatch, true);
    assert.equal(resolution.logUnbound, false);
  });

  it('rejects another song owned by the same uid when the binding names a song', () => {
    const other = generation({
      id: 'gen-other',
      songId: 'song-other',
      taskId: TASK_ID,
      createdAt: insideWindow,
    });
    const resolution = resolveMusicGptGeneration({
      taskId: TASK_ID,
      binding: binding({ uid: 'victim', songId: 'song-victim' }),
      bindingDocPresent: true,
      nowMs: NOW_MS,
      candidates: [candidate(other, 'victim')],
    });
    assert.equal(resolution.accepted, null);
    assert.equal(resolution.logMismatch, true);
    assert.equal(resolution.logUnbound, false);
  });

  it('does not use the legacy fallback when a binding doc exists but cannot be read', () => {
    const legacy = generation({
      id: 'gen-legacy',
      songId: 'song-legacy',
      taskId: TASK_ID,
      createdAt: insideWindow,
    });
    const resolution = resolveMusicGptGeneration({
      taskId: TASK_ID,
      binding: null,
      bindingDocPresent: true,
      nowMs: NOW_MS,
      candidates: [candidate(legacy, 'victim')],
    });
    assert.equal(resolution.accepted, null);
    assert.equal(resolution.mode, 'none');
    assert.equal(resolution.logUnbound, false);
    assert.equal(resolution.logMismatch, true);
  });

  it('rejects the attacker when theirs is the only generation with the task id', () => {
    const resolution = resolveMusicGptGeneration({
      taskId: TASK_ID,
      binding: binding({ uid: 'victim', songId: 'song-victim' }),
      bindingDocPresent: true,
      candidates: [candidate(attacker, 'attacker')],
    });
    assert.equal(resolution.accepted, null);
    assert.equal(resolution.logMismatch, true);
  });

  it('matches any song of the bound uid when songId was not sent', () => {
    const otherSong = generation({
      id: 'gen-other',
      songId: 'song-other',
      taskId: TASK_ID,
      createdAt: insideWindow,
    });
    const resolution = resolveMusicGptGeneration({
      taskId: TASK_ID,
      binding: binding({ uid: 'victim', songId: null }),
      bindingDocPresent: true,
      nowMs: NOW_MS,
      candidates: [candidate(attacker, 'attacker'), candidate(otherSong, 'victim')],
    });
    assert.equal(resolution.accepted?.id, 'gen-other');
    assert.equal(resolution.logMismatch, true);
  });

  it('accepts one unbound generation created inside the 15 minute window', () => {
    const legacy = generation({
      id: 'gen-legacy',
      songId: 'song-legacy',
      taskId: TASK_ID,
      createdAt: insideWindow,
    });
    const resolution = resolveMusicGptGeneration({
      taskId: TASK_ID,
      binding: null,
      bindingDocPresent: false,
      nowMs: NOW_MS,
      candidates: [candidate(legacy, 'victim')],
    });
    assert.equal(resolution.mode, 'legacy');
    assert.equal(resolution.accepted?.id, 'gen-legacy');
    assert.equal(resolution.logUnbound, false);
    assert.equal(LEGACY_UNBOUND_WINDOW_MS, 15 * 60 * 1000);
  });

  it('rejects one unbound generation created outside the 15 minute window', () => {
    const stale = generation({
      id: 'gen-stale',
      songId: 'song-stale',
      taskId: TASK_ID,
      createdAt: outsideWindow,
    });
    const resolution = resolveMusicGptGeneration({
      taskId: TASK_ID,
      binding: null,
      bindingDocPresent: false,
      nowMs: NOW_MS,
      candidates: [candidate(stale, 'victim')],
    });
    assert.equal(resolution.accepted, null);
    assert.equal(resolution.logUnbound, true);
    assert.equal(resolution.logMismatch, false);
  });

  it('rejects two unbound generations even when both are inside the window', () => {
    const first = generation({
      id: 'gen-a',
      songId: 'song-a',
      taskId: TASK_ID,
      createdAt: insideWindow,
    });
    const second = generation({
      id: 'gen-b',
      songId: 'song-b',
      taskId: TASK_ID,
      createdAt: insideWindow,
    });
    const resolution = resolveMusicGptGeneration({
      taskId: TASK_ID,
      binding: null,
      bindingDocPresent: false,
      nowMs: NOW_MS,
      candidates: [candidate(first, 'victim'), candidate(second, 'attacker')],
    });
    assert.equal(resolution.accepted, null);
    assert.equal(resolution.logUnbound, true);
    assert.equal(resolution.logMismatch, false);
  });

  it('redacts the task id before it is logged', () => {
    setEnv('MUSICGPT_WEBHOOK_SECRET', 'webhook-secret');
    assert.equal(musicGptTaskLogId('task-webhook-secret-1'), 'task-[redacted]-1');
    assert.equal(
      musicGptTaskLogId('https://example.test/hook?token=webhook-secret'),
      'https://example.test/hook?token=[redacted]'
    );
  });

  it('sets expireAt seven days after createdAt', () => {
    const now = 1_700_000_000_000;
    const fields = musicGptTaskBindingFields({
      uid: 'victim',
      songId: null,
      conversionIds: ['c1'],
      nowMs: now,
    });
    assert.equal(fields.uid, 'victim');
    assert.equal(fields.songId, null);
    assert.deepEqual(fields.conversionIds, ['c1']);
    assert.equal(fields.createdAt.toMillis(), now);
    assert.equal(fields.expireAt.toMillis(), now + MUSICGPT_TASK_TTL_MS);
    assert.equal(MUSICGPT_TASK_TTL_MS, 7 * 24 * 60 * 60 * 1000);
  });
});

describe('MusicGPT webhook task binding', { concurrency: false }, () => {
  function recent() {
    return Timestamp.fromMillis(Date.now() - 60_000);
  }
  function stale() {
    return Timestamp.fromMillis(Date.now() - LEGACY_UNBOUND_WINDOW_MS - 1_000);
  }

  it('writes audio for a bound generation', async () => {
    await withWebhookDb(async (memory, warnings) => {
      const victimSong = song({ id: 'song-victim', ownerId: 'victim', title: 'Real' });
      const victimGen = generation({
        id: 'gen-victim',
        songId: victimSong.id,
        taskId: TASK_ID,
        createdAt: recent(),
      });
      await seed(memory, {
        songs: [victimSong],
        generations: [victimGen],
        taskBinding: binding({ uid: 'victim', songId: victimSong.id }),
      });

      const response = await processMusicGptWebhook(completionBody());
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);

      const versions = versionsFor(memory, victimSong.id);
      assert.equal(versions.length, 1);
      assert.equal(versions[0].data.audioURL, AUDIO_URL);
      const stored = memory.list(COLLECTIONS.generations).find((row) => row.id === 'gen-victim');
      assert.equal(stored?.data.status, 'completed');
      assert.equal(warnings.some((line) => line.startsWith('musicgpt_task_mismatch')), false);
      assert.equal(warnings.some((line) => line.startsWith('musicgpt_task_unbound')), false);
    });
  });

  it('does not give audio to an attacker who copied the task id', async () => {
    await withWebhookDb(async (memory, warnings) => {
      const victimSong = song({ id: 'song-victim', ownerId: 'victim', title: 'Real' });
      const attackerSong = song({ id: 'song-attacker', ownerId: 'attacker', title: 'Stolen' });
      const attackerGen = generation({
        id: 'gen-attacker',
        songId: attackerSong.id,
        taskId: TASK_ID,
        createdAt: recent(),
      });
      const victimGen = generation({
        id: 'gen-victim',
        songId: victimSong.id,
        taskId: TASK_ID,
        createdAt: recent(),
      });
      await seed(memory, {
        songs: [attackerSong, victimSong],
        generations: [attackerGen, victimGen],
        taskBinding: binding({ uid: 'victim', songId: victimSong.id }),
      });

      const response = await processMusicGptWebhook(completionBody());
      assert.equal(response.status, 200);

      assert.equal(versionsFor(memory, attackerSong.id).length, 0);
      const victimVersions = versionsFor(memory, victimSong.id);
      assert.equal(victimVersions.length, 1);
      assert.equal(victimVersions[0].data.audioURL, AUDIO_URL);

      const storedAttacker = memory.list(COLLECTIONS.generations).find((row) => row.id === 'gen-attacker');
      assert.equal(storedAttacker?.data.status, 'pending');
      assert.equal(storedAttacker?.data.output && (storedAttacker.data.output as { audioURL: string | null }).audioURL, null);
      assert.equal(
        warnings.some((line) => line === `musicgpt_task_mismatch ${TASK_ID}`),
        true
      );
    });
  });

  it('writes nothing for one unbound generation outside the window', async () => {
    await withWebhookDb(async (memory, warnings) => {
      const attackerSong = song({ id: 'song-attacker', ownerId: 'attacker', title: 'Stolen' });
      const attackerGen = generation({
        id: 'gen-attacker',
        songId: attackerSong.id,
        taskId: TASK_ID,
        createdAt: stale(),
      });
      await seed(memory, {
        songs: [attackerSong],
        generations: [attackerGen],
        taskBinding: null,
      });

      const before = JSON.stringify(memory.list(COLLECTIONS.generations));
      const response = await processMusicGptWebhook(completionBody());
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(memory.list(COLLECTIONS.songVersions).length, 0);
      assert.equal(JSON.stringify(memory.list(COLLECTIONS.generations)), before);
      assert.equal(warnings.some((line) => line === `musicgpt_task_unbound ${TASK_ID}`), true);
      assert.equal(warnings.some((line) => line.startsWith('musicgpt_task_mismatch')), false);
    });
  });

  it('completes one unbound generation created inside the window', async () => {
    await withWebhookDb(async (memory, warnings) => {
      const legacySong = song({ id: 'song-legacy', ownerId: 'victim', title: 'In flight' });
      const legacyGen = generation({
        id: 'gen-legacy',
        songId: legacySong.id,
        taskId: TASK_ID,
        createdAt: recent(),
      });
      await seed(memory, {
        songs: [legacySong],
        generations: [legacyGen],
      });

      const response = await processMusicGptWebhook(completionBody());
      assert.equal(response.status, 200);
      const versions = versionsFor(memory, legacySong.id);
      assert.equal(versions.length, 1);
      assert.equal(versions[0].data.audioURL, AUDIO_URL);
      assert.equal(warnings.some((line) => line.startsWith('musicgpt_task_unbound')), false);
    });
  });

  it('writes nothing when two unbound generations share the task id inside the window', async () => {
    await withWebhookDb(async (memory, warnings) => {
      const firstSong = song({ id: 'song-a', ownerId: 'victim', title: 'A' });
      const secondSong = song({ id: 'song-b', ownerId: 'attacker', title: 'B' });
      await seed(memory, {
        songs: [firstSong, secondSong],
        generations: [
          generation({
            id: 'gen-a',
            songId: firstSong.id,
            taskId: TASK_ID,
            createdAt: recent(),
          }),
          generation({
            id: 'gen-b',
            songId: secondSong.id,
            taskId: TASK_ID,
            createdAt: recent(),
          }),
        ],
      });

      const before = JSON.stringify(memory.list(COLLECTIONS.generations));
      const response = await processMusicGptWebhook(completionBody());
      assert.equal(response.status, 200);
      assert.equal(memory.list(COLLECTIONS.songVersions).length, 0);
      assert.equal(JSON.stringify(memory.list(COLLECTIONS.generations)), before);
      assert.equal(warnings.some((line) => line === `musicgpt_task_unbound ${TASK_ID}`), true);
    });
  });
});

describe('POST /api/generations/musicgpt song binding', { concurrency: false }, () => {
  function request(body: Record<string, unknown>) {
    return new NextRequest('https://configured.example/api/generations/musicgpt', {
      method: 'POST',
      headers: {
        authorization: 'Bearer good-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  async function callRoute(
    body: Record<string, unknown>,
    deps: MusicGptGenerationDeps
  ) {
    setEnv('WEBHOOK_BASE_URL', 'https://configured.example');
    setEnv('MUSICGPT_WEBHOOK_SECRET', 'webhook-secret');
    setMusicGptGenerationDepsForTests(deps);
    return POST(request(body));
  }

  it('returns 403 when songId belongs to someone else', async () => {
    let musicCalls = 0;
    let saves = 0;
    const response = await callRoute(
      { prompt: 'a song', songId: 'song-victim' },
      {
        verifyToken: async () => ({ uid: 'attacker' }),
        getSong: async (id) => {
          assert.equal(id, 'song-victim');
          return song({ id, ownerId: 'victim', title: 'Theirs' });
        },
        createMusic: async () => {
          musicCalls += 1;
          throw new Error('MusicGPT should not be called');
        },
        saveTaskBinding: async () => {
          saves += 1;
          throw new Error('binding should not be written');
        },
      }
    );

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'Only the owner can generate for this song');
    assert.equal(musicCalls, 0);
    assert.equal(saves, 0);
  });

  it('stores a binding for a song the caller owns', async () => {
    const saved: Array<{ taskId: string; uid: string; songId: string | null; conversionIds: string[] }> = [];
    const response = await callRoute(
      { prompt: 'a song', songId: 'song-victim' },
      {
        verifyToken: async () => ({ uid: 'victim' }),
        getSong: async (id) => song({ id, ownerId: 'victim', title: 'Mine' }),
        createMusic: async () => ({
          task_id: 'task-owned',
          conversion_id_1: 'c1',
          conversion_id_2: 'c2',
        }),
        saveTaskBinding: async (input) => {
          saved.push(input);
        },
      }
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.taskId, 'task-owned');
    assert.deepEqual(saved, [
      {
        taskId: 'task-owned',
        uid: 'victim',
        songId: 'song-victim',
        conversionIds: ['c1', 'c2'],
      },
    ]);
  });

  it('stores songId null when the client omits it', async () => {
    let songReads = 0;
    const saved: Array<{ songId: string | null; uid: string }> = [];
    const response = await callRoute(
      { prompt: 'a song' },
      {
        verifyToken: async () => ({ uid: 'mobile-user' }),
        getSong: async () => {
          songReads += 1;
          return null;
        },
        createMusic: async () => ({ task_id: 'task-mobile', conversion_id_1: 'c1' }),
        saveTaskBinding: async (input) => {
          saved.push({ songId: input.songId, uid: input.uid });
        },
      }
    );

    assert.equal(response.status, 200);
    assert.equal(songReads, 0);
    assert.deepEqual(saved, [{ songId: null, uid: 'mobile-user' }]);
  });
});
