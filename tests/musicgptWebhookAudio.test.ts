import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { setAdminDbForTests } from '../lib/firebase/admin';
import { COLLECTIONS } from '../lib/firebase/collections';
import { processMusicGptWebhook } from '../lib/server/musicgptWebhook';
import {
  firebaseAudioDownloadUrl,
  setSongAudioStorageDepsForTests,
  songAudioObjectPath,
  type SongAudioBucket,
  type SongAudioFile,
} from '../lib/server/songAudioStorage';
import type { GenerationDocument, SongDocument } from '../types/firestore';
import { isListedOnPublicShelf } from '../lib/songs/catalogAudio';

const TASK_ID = 'task-audio-1';
const SONG_ID = 'song-1';
const BUCKET = 'stream-dev-48098.firebasestorage.app';
const CONV_A = 'conv-a';
const CONV_B = 'conv-b';

function audioUrl(conversionId: string): string {
  return `https://cdn1.musicgpt.com/conversions/api/standard/${conversionId}/${conversionId}.mp3`;
}

type DocData = Record<string, unknown>;
type Stored = { bytes: Buffer; token: string; contentType?: string };

type DocRef = {
  id: string;
  get: () => Promise<{ id: string; exists: boolean; data: () => DocData | undefined; ref: DocRef }>;
  set: (data: DocData, options?: { merge?: boolean }) => Promise<void>;
  update: (data: DocData) => Promise<void>;
};

function createMemoryAdminDb() {
  const tables = new Map<string, Map<string, DocData>>();
  const refs = new Map<string, DocRef>();
  let seq = 0;

  function rowsFor(name: string): Map<string, DocData> {
    let rows = tables.get(name);
    if (!rows) {
      rows = new Map();
      tables.set(name, rows);
    }
    return rows;
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

  function docRef(name: string, id: string): DocRef {
    const key = `${name}/${id}`;
    const existing = refs.get(key);
    if (existing) return existing;
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
        if (options?.merge && rows.has(id)) rows.set(id, { ...rows.get(id), ...data });
        else rows.set(id, { ...data });
      },
      async update(data) {
        const current = rows.get(id);
        if (!current) throw new Error(`No document to update: ${name}/${id}`);
        rows.set(id, { ...current, ...data });
      },
    };
    refs.set(key, ref);
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
            const cmp = compare(left[1][field], right[1][field]);
            return direction === 'desc' ? -cmp : cmp;
          });
        }
        if (limitN != null) entries = entries.slice(0, limitN);
        const docs = entries.map(([id]) => {
          const ref = docRef(name, id);
          return { id, ref, data: () => ({ ...rowsFor(name).get(id)! }) };
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
          orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
            return query(name, [], field, dir, null);
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

function createBucket(): SongAudioBucket & { files: Map<string, Stored>; saves: string[] } {
  const files = new Map<string, Stored>();
  const saves: string[] = [];
  return {
    name: BUCKET,
    files,
    saves,
    file(objectPath: string): SongAudioFile {
      return {
        async exists() {
          return [files.has(objectPath)];
        },
        async getMetadata() {
          const row = files.get(objectPath);
          if (!row) {
            const error = new Error('missing') as Error & { code: number };
            error.code = 404;
            throw error;
          }
          return [{ metadata: { firebaseStorageDownloadTokens: row.token } }];
        },
        async save(data, options) {
          saves.push(objectPath);
          files.set(objectPath, {
            bytes: Buffer.from(data),
            token: options.metadata?.metadata?.firebaseStorageDownloadTokens ?? '',
            contentType: options.metadata?.contentType,
          });
        },
        async setMetadata(metadata) {
          const row = files.get(objectPath);
          if (!row) throw new Error('missing');
          row.token = metadata.metadata?.firebaseStorageDownloadTokens ?? row.token;
        },
      };
    },
  };
}

function song(): SongDocument {
  const now = Timestamp.fromMillis(0);
  return {
    id: SONG_ID,
    ownerId: 'owner-1',
    artistId: 'artist-1',
    artistVersionId: 'av-1',
    title: 'Night Drive',
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

function generation(conversionIds: string[]): GenerationDocument {
  return {
    id: 'gen-1',
    songId: SONG_ID,
    artistVersionId: 'av-1',
    songVersionId: null,
    prompt: { structured: {}, freeText: 'a song' },
    parameters: {},
    provider: 'musicgpt',
    status: 'pending',
    providerTaskId: TASK_ID,
    providerConversionIds: conversionIds,
    providerProcessedConversions: [],
    output: { audioURL: null, stems: null, metadata: {} },
    error: null,
    createdAt: Timestamp.fromMillis(Date.now() - 5_000) as unknown as GenerationDocument['createdAt'],
    completedAt: null,
    contentHash: null,
  };
}

const savedEnv: Record<string, string | undefined> = {};
const originalFetch = globalThis.fetch;

function setEnv(name: string, value: string | undefined) {
  if (!(name in savedEnv)) savedEnv[name] = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  setAdminDbForTests(null);
  setSongAudioStorageDepsForTests(null);
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

async function seed(
  memory: ReturnType<typeof createMemoryAdminDb>,
  conversionIds: string[],
  songOverrides?: DocData
) {
  setEnv('MUSICGPT_BASE_URL', 'https://api.musicgpt.com/api/public/v1');
  setEnv('MUSICGPT_API_KEY', 'test-musicgpt-key');
  setEnv('MUSICGPT_WEBHOOK_SECRET', 'webhook-secret');
  setEnv('COVER_PIPELINE', undefined);
  setEnv('X_CLIENT_ID', undefined);
  setEnv('X_CLIENT_SECRET', undefined);
  setEnv('NEXT_PUBLIC_APP_URL', undefined);
  globalThis.fetch = (async () => new Response('no', { status: 404 })) as typeof fetch;
  await memory.db.collection(COLLECTIONS.songs).doc(SONG_ID).set({
    ...(song() as unknown as DocData),
    ...songOverrides,
  });
  await memory.db
    .collection(COLLECTIONS.generations)
    .doc('gen-1')
    .set(generation(conversionIds) as unknown as DocData);
  await memory.db.collection(COLLECTIONS.musicgptTasks).doc(TASK_ID).set({
    uid: 'owner-1',
    songId: SONG_ID,
    conversionIds,
    createdAt: Timestamp.now(),
    expireAt: Timestamp.fromMillis(Date.now() + 60_000),
    apiVersion: 'v1',
  });
  setAdminDbForTests(memory.db);
}

function mp3Fetch(fail: Set<string> = new Set()): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (fail.has(url)) return new Response('gone', { status: 404 });
    if (url.includes('cdn1.musicgpt.com') && (init?.method ?? 'GET') === 'GET') {
      return new Response('mp3', {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      });
    }
    return new Response('no', { status: 404 });
  }) as typeof fetch;
}

function versions(memory: ReturnType<typeof createMemoryAdminDb>) {
  return memory.list(COLLECTIONS.songVersions).sort((a, b) => {
    return Number(a.data.versionNumber) - Number(b.data.versionNumber);
  });
}

describe('MusicGPT webhook audio persistence', { concurrency: false }, () => {
  it('stores both conversion MP3s and plays the Storage URL', async () => {
    const memory = createMemoryAdminDb();
    const bucket = createBucket();
    setSongAudioStorageDepsForTests({ bucket, fetchImpl: mp3Fetch() });
    await seed(memory, [CONV_A, CONV_B]);

    const first = await processMusicGptWebhook({
      success: true,
      conversion_type: 'MUSIC_AI',
      task_id: TASK_ID,
      conversion_id: CONV_A,
      conversion_path: audioUrl(CONV_A),
    });
    assert.equal(first.status, 200);

    const second = await processMusicGptWebhook({
      success: true,
      conversion_type: 'MUSIC_AI',
      task_id: TASK_ID,
      conversion_id: CONV_B,
      conversion_path: audioUrl(CONV_B),
    });
    assert.equal(second.status, 200);

    const storedVersions = versions(memory);
    assert.equal(storedVersions.length, 2);
    for (const conversionId of [CONV_A, CONV_B]) {
      const version = storedVersions.find((row) => row.data.providerOutputId === conversionId);
      const objectPath = songAudioObjectPath(SONG_ID, conversionId);
      const file = bucket.files.get(objectPath);
      assert.equal(file?.contentType, 'audio/mpeg');
      assert.equal(version?.data.musicgptAudioUrl, audioUrl(conversionId));
      assert.equal(version?.data.audioPersisted, true);
      assert.equal(
        version?.data.audioURL,
        firebaseAudioDownloadUrl(BUCKET, objectPath, file?.token ?? '')
      );
    }
    assert.deepEqual(bucket.saves, [
      songAudioObjectPath(SONG_ID, CONV_A),
      songAudioObjectPath(SONG_ID, CONV_B),
    ]);

    const pendingAfterFirst = storedVersions[0];
    assert.equal(pendingAfterFirst?.data.audioPersisted, true);
    const generationDoc = memory.list(COLLECTIONS.generations).find((row) => row.id === 'gen-1');
    assert.equal(generationDoc?.data.status, 'completed');
    const output = generationDoc?.data.output as { audioURL: string; metadata: Record<string, { conversion_path: string; audioPersisted: boolean }> };
    const pathB = songAudioObjectPath(SONG_ID, CONV_B);
    assert.equal(
      output.audioURL,
      firebaseAudioDownloadUrl(BUCKET, pathB, bucket.files.get(pathB)?.token ?? '')
    );
    assert.equal(output.metadata[`conversion_${CONV_A}`].conversion_path, audioUrl(CONV_A));
    assert.equal(output.metadata[`conversion_${CONV_B}`].audioPersisted, true);
    assert.equal(output.metadata[`conversion_${CONV_A}`].audioPersisted, true);
  });

  it('falls back to the MusicGPT URL when the copy fails', async () => {
    const memory = createMemoryAdminDb();
    const bucket = createBucket();
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    };
    setSongAudioStorageDepsForTests({
      bucket,
      fetchImpl: mp3Fetch(new Set([audioUrl(CONV_A)])),
    });
    await seed(memory, [CONV_A]);
    try {
      const response = await processMusicGptWebhook({
        success: true,
        conversion_type: 'MUSIC_AI',
        task_id: TASK_ID,
        conversion_id: CONV_A,
        conversion_path: audioUrl(CONV_A),
      });
      assert.equal(response.status, 200);
      const stored = versions(memory);
      assert.equal(stored.length, 1);
      assert.equal(stored[0]?.data.audioURL, audioUrl(CONV_A));
      assert.equal(stored[0]?.data.musicgptAudioUrl, audioUrl(CONV_A));
      assert.equal(stored[0]?.data.audioPersisted, false);
      assert.equal(bucket.saves.length, 0);
      const generationDoc = memory.list(COLLECTIONS.generations).find((row) => row.id === 'gen-1');
      const output = generationDoc?.data.output as { audioURL: string };
      assert.equal(output.audioURL, audioUrl(CONV_A));
      assert.equal(errors.some((line) => line.startsWith('song_audio_persist_failed')), true);
    } finally {
      console.error = original;
    }
  });

  it('does not upload or create a second version on webhook retry', async () => {
    const memory = createMemoryAdminDb();
    const bucket = createBucket();
    let downloads = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('cdn1.musicgpt.com')) {
        downloads += 1;
        return new Response('mp3', { status: 200 });
      }
      return new Response('no', { status: 404 });
    }) as typeof fetch;
    setSongAudioStorageDepsForTests({ bucket, fetchImpl });
    await seed(memory, [CONV_A]);
    const body = {
      success: true,
      conversion_type: 'MUSIC_AI',
      task_id: TASK_ID,
      conversion_id: CONV_A,
      conversion_path: audioUrl(CONV_A),
    };
    assert.equal((await processMusicGptWebhook(body)).status, 200);
    assert.equal((await processMusicGptWebhook(body)).status, 200);
    assert.equal(versions(memory).length, 1);
    assert.equal(bucket.saves.length, 1);
    assert.equal(downloads, 1);
  });

  it('reuses an object already stored for this conversion', async () => {
    const memory = createMemoryAdminDb();
    const bucket = createBucket();
    const objectPath = songAudioObjectPath(SONG_ID, CONV_A);
    bucket.files.set(objectPath, {
      bytes: Buffer.from('ready'),
      token: 'existing-token',
      contentType: 'audio/mpeg',
    });
    let fetched = 0;
    const fetchImpl = (async () => {
      fetched += 1;
      return new Response('no', { status: 500 });
    }) as typeof fetch;
    setSongAudioStorageDepsForTests({ bucket, fetchImpl });
    await seed(memory, [CONV_A]);
    const response = await processMusicGptWebhook({
      success: true,
      conversion_type: 'MUSIC_AI',
      task_id: TASK_ID,
      conversion_id: CONV_A,
      conversion_path: audioUrl(CONV_A),
    });
    assert.equal(response.status, 200);
    assert.equal(fetched, 0);
    assert.equal(bucket.saves.length, 0);
    assert.equal(
      versions(memory)[0]?.data.audioURL,
      firebaseAudioDownloadUrl(BUCKET, objectPath, 'existing-token')
    );
    assert.equal(versions(memory)[0]?.data.audioPersisted, true);
    assert.equal(versions(memory)[0]?.data.musicgptAudioUrl, audioUrl(CONV_A));
  });

  it('makes a held song visible on the first stored audio and revalidates New', async () => {
    const memory = createMemoryAdminDb();
    const bucket = createBucket();
    const calls: string[] = [];
    setSongAudioStorageDepsForTests({ bucket, fetchImpl: mp3Fetch() });
    await seed(memory, [CONV_A], {
      isPublic: false,
      audioReady: false,
      publicOnReady: true,
    });
    setEnv('NEXT_PUBLIC_APP_URL', 'https://preview.example.com');
    setEnv('REVALIDATE_SECRET', 'revalidate-header-secret');
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('cdn1.musicgpt.com')) {
        return new Response('mp3', { status: 200 });
      }
      return new Response('ok', { status: 200 });
    }) as typeof fetch;

    const before = memory.list(COLLECTIONS.songs).find((row) => row.id === SONG_ID);
    assert.equal(
      isListedOnPublicShelf(
        {
          isPublic: before?.data?.isPublic === true,
          audioReady: before?.data?.audioReady === false ? false : undefined,
          deletedAt: before?.data?.deletedAt ?? null,
        },
        []
      ),
      false
    );

    const response = await processMusicGptWebhook({
      success: true,
      conversion_type: 'MUSIC_AI',
      task_id: TASK_ID,
      conversion_id: CONV_A,
      conversion_path: audioUrl(CONV_A),
    });
    assert.equal(response.status, 200);

    const after = memory.list(COLLECTIONS.songs).find((row) => row.id === SONG_ID);
    assert.equal(after?.data.audioReady, true);
    assert.equal(after?.data.isPublic, true);
    const versionRows = versions(memory).map((row) => ({
      audioURL: typeof row.data.audioURL === 'string' ? row.data.audioURL : null,
      isPrimary: row.data.isPrimary === true,
      audioExpired: row.data.audioExpired === true,
    }));
    assert.equal(versionRows.length, 1);
    assert.equal(
      isListedOnPublicShelf(
        {
          isPublic: after?.data?.isPublic === true,
          audioReady: after?.data?.audioReady === true,
          deletedAt: after?.data?.deletedAt ?? null,
        },
        versionRows
      ),
      true
    );
    assert.equal(calls.includes('https://preview.example.com/api/revalidate'), true);
  });

  it('marks a shell failed when MusicGPT reports failure and does not publish it', async () => {
    const memory = createMemoryAdminDb();
    const bucket = createBucket();
    setSongAudioStorageDepsForTests({ bucket, fetchImpl: mp3Fetch() });
    await seed(memory, [CONV_A], {
      isPublic: false,
      audioReady: false,
      publicOnReady: true,
    });

    const response = await processMusicGptWebhook({
      success: false,
      conversion_type: 'MUSIC_AI',
      task_id: TASK_ID,
      reason: 'provider failed',
    });
    assert.equal(response.status, 200);
    const songDoc = memory.list(COLLECTIONS.songs).find((row) => row.id === SONG_ID);
    assert.equal(songDoc?.data.generationStatus, 'failed');
    assert.equal(songDoc?.data.isPublic, false);
    assert.equal(songDoc?.data.audioReady, false);
    assert.equal(versions(memory).length, 0);
    const generationDoc = memory.list(COLLECTIONS.generations).find((row) => row.id === 'gen-1');
    assert.equal(generationDoc?.data.status, 'failed');
    assert.equal(bucket.saves.length, 0);
  });

  it('publishes the first audio after a timeout failure unless the song was deleted', async () => {
    const memory = createMemoryAdminDb();
    const bucket = createBucket();
    setSongAudioStorageDepsForTests({ bucket, fetchImpl: mp3Fetch() });
    await seed(memory, [CONV_A], {
      isPublic: false,
      audioReady: false,
      publicOnReady: true,
      generationStatus: 'failed',
      createdAt: Timestamp.fromMillis(0),
    });

    const late = await processMusicGptWebhook({
      success: true,
      conversion_type: 'MUSIC_AI',
      task_id: TASK_ID,
      conversion_id: CONV_A,
      conversion_path: audioUrl(CONV_A),
    });
    assert.equal(late.status, 200);
    const songDoc = memory.list(COLLECTIONS.songs).find((row) => row.id === SONG_ID);
    assert.equal(songDoc?.data.audioReady, true);
    assert.equal(songDoc?.data.isPublic, true);
    assert.notEqual(songDoc?.data.generationStatus, 'failed');
    assert.equal(versions(memory).length, 1);

    const deleted = createMemoryAdminDb();
    setSongAudioStorageDepsForTests({ bucket: createBucket(), fetchImpl: mp3Fetch() });
    await seed(deleted, [CONV_A], {
      isPublic: false,
      audioReady: false,
      publicOnReady: true,
      deletedAt: Timestamp.fromMillis(50),
    });
    const skipped = await processMusicGptWebhook({
      success: true,
      conversion_type: 'MUSIC_AI',
      task_id: TASK_ID,
      conversion_id: CONV_A,
      conversion_path: audioUrl(CONV_A),
    });
    assert.equal(skipped.status, 200);
    const gone = deleted.list(COLLECTIONS.songs).find((row) => row.id === SONG_ID);
    assert.equal(gone?.data.audioReady, false);
    assert.equal(gone?.data.isPublic, false);
    assert.equal(versions(deleted).length, 0);
  });
});
