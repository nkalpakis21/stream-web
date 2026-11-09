import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, it } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import {
  backfillSongAudio,
  type AudioBackfillDb,
  type AudioDocRef,
  type AudioDocSnap,
  type AudioQuery,
} from '../lib/server/backfillSongAudio';
import { COLLECTIONS } from '../lib/firebase/collections';
import {
  firebaseAudioDownloadUrl,
  songAudioObjectPath,
  type SongAudioBucket,
  type SongAudioFile,
} from '../lib/server/songAudioStorage';

const BUCKET = 'stream-dev-48098.firebasestorage.app';
const OLD_URL = 'https://cdn1.musicgpt.com/conversions/old.mp3';
const NEW_URL = 'https://cdn1.musicgpt.com/conversions/new.mp3';
const STORED_URL = firebaseAudioDownloadUrl(BUCKET, 'songs/song-mid/audio/mid.mp3', 'kept');

type DocData = Record<string, unknown>;
type Stored = { bytes: Buffer; token: string; contentType?: string };

function createDb() {
  const tables = new Map<string, Map<string, DocData>>();
  const writes: Array<{ name: string; id: string; data: DocData }> = [];

  function rowsFor(name: string): Map<string, DocData> {
    let rows = tables.get(name);
    if (!rows) {
      rows = new Map();
      tables.set(name, rows);
    }
    return rows;
  }

  function millis(value: unknown): number {
    if (value && typeof value === 'object' && 'toMillis' in value) {
      const ms = (value as { toMillis: () => number }).toMillis();
      if (Number.isFinite(ms)) return ms;
    }
    return 0;
  }

  function refFor(name: string, id: string): AudioDocRef {
    return {
      async update(data) {
        const current = rowsFor(name).get(id);
        if (!current) throw new Error(`missing ${name}/${id}`);
        const next = { ...current, ...data };
        rowsFor(name).set(id, next);
        writes.push({ name, id, data });
      },
      async set(data, options) {
        const current = rowsFor(name).get(id);
        const next = options?.merge && current ? { ...current, ...data } : { ...data };
        rowsFor(name).set(id, next);
        writes.push({ name, id, data });
      },
    };
  }

  function snap(name: string, id: string): AudioDocSnap {
    return {
      id,
      ref: refFor(name, id),
      data: () => ({ ...(rowsFor(name).get(id) ?? {}) }),
    };
  }

  function query(
    name: string,
    filters: Array<{ field: string; value: unknown }>,
    orderField: string | null,
    direction: 'asc' | 'desc',
    limitN: number | null,
    startAfterId: string | null
  ): AudioQuery {
    return {
      where(field, op, value) {
        if (op !== '==') throw new Error(`unsupported op ${op}`);
        return query(name, [...filters, { field, value }], orderField, direction, limitN, startAfterId);
      },
      orderBy(field, dir = 'asc') {
        return query(name, filters, field, dir, limitN, startAfterId);
      },
      limit(n) {
        return query(name, filters, orderField, direction, n, startAfterId);
      },
      startAfter(cursor) {
        return query(name, filters, orderField, direction, limitN, cursor.id);
      },
      async get() {
        let entries = [...rowsFor(name).entries()].filter(([, data]) =>
          filters.every((filter) => data[filter.field] === filter.value)
        );
        if (orderField) {
          const field = orderField;
          entries.sort((left, right) => {
            const cmp = millis(left[1][field]) - millis(right[1][field]);
            const directed = direction === 'desc' ? -cmp : cmp;
            if (directed !== 0) return directed;
            return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
          });
        }
        if (startAfterId) {
          const index = entries.findIndex(([id]) => id === startAfterId);
          if (index >= 0) entries = entries.slice(index + 1);
        }
        if (limitN != null) entries = entries.slice(0, limitN);
        const docs = entries.map(([id]) => snap(name, id));
        return { empty: docs.length === 0, size: docs.length, docs };
      },
    };
  }

  const db: AudioBackfillDb = {
    collection(name: string) {
      const base = query(name, [], null, 'asc', null, null);
      return {
        ...base,
        doc(id: string) {
          return refFor(name, id);
        },
      };
    },
  };

  return {
    db,
    writes,
    async put(name: string, id: string, data: DocData) {
      rowsFor(name).set(id, { ...data });
    },
    read(name: string, id: string) {
      return rowsFor(name).get(id);
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

function at(ms: number) {
  return Timestamp.fromMillis(ms);
}

async function seedCatalog(memory: ReturnType<typeof createDb>) {
  await memory.put(COLLECTIONS.songs, 'song-new', {
    id: 'song-new',
    createdAt: at(3_000),
  });
  await memory.put(COLLECTIONS.songs, 'song-old', {
    id: 'song-old',
    createdAt: at(1_000),
  });
  await memory.put(COLLECTIONS.songs, 'song-mid', {
    id: 'song-mid',
    createdAt: at(2_000),
  });
  await memory.put(COLLECTIONS.songVersions, 'ver-old', {
    id: 'ver-old',
    songId: 'song-old',
    audioURL: OLD_URL,
    providerOutputId: 'conv-old',
    createdAt: at(1_000),
  });
  await memory.put(COLLECTIONS.songVersions, 'ver-mid', {
    id: 'ver-mid',
    songId: 'song-mid',
    audioURL: STORED_URL,
    providerOutputId: 'conv-mid',
    createdAt: at(2_000),
  });
  await memory.put(COLLECTIONS.songVersions, 'ver-new', {
    id: 'ver-new',
    songId: 'song-new',
    audioURL: NEW_URL,
    providerOutputId: 'conv-new',
    createdAt: at(3_000),
  });
  await memory.put(COLLECTIONS.generations, 'gen-old', {
    id: 'gen-old',
    songId: 'song-old',
    providerConversionIds: ['conv-old'],
    output: { audioURL: OLD_URL, stems: null, metadata: {} },
  });
}

function probeFetch(): { fetchImpl: typeof fetch; seen: string[] } {
  const seen: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    seen.push(`${method} ${url}`);
    if (url === OLD_URL) return new Response(null, { status: 200 });
    if (url === NEW_URL) return new Response('gone', { status: 404 });
    return new Response('no', { status: 500 });
  }) as typeof fetch;
  return { fetchImpl, seen };
}

describe('backfillSongAudio', () => {
  it('dry-run checks oldest MusicGPT URLs and writes nothing', async () => {
    const memory = createDb();
    await seedCatalog(memory);
    const bucket = createBucket();
    const { fetchImpl, seen } = probeFetch();
    const logDir = mkdtempSync(join(tmpdir(), 'song-audio-'));
    const summary = await backfillSongAudio({
      db: memory.db,
      bucket,
      dryRun: true,
      limit: null,
      projectLabel: 'stream-dev',
      logDir,
      fetchImpl,
      pageSize: 1,
    });

    assert.equal(summary.songsScanned, 3);
    assert.equal(summary.stillOnMusicGpt, 2);
    assert.equal(summary.fetchable, 1);
    assert.equal(summary.unfetchable, 1);
    assert.equal(summary.unfetchableNotFound, 1);
    assert.equal(summary.migrated, 0);
    assert.equal(summary.failed, 0);
    assert.equal(summary.dryRun, true);
    assert.equal(memory.writes.length, 0);
    assert.equal(bucket.saves.length, 0);
    assert.equal(memory.read(COLLECTIONS.songVersions, 'ver-old')?.audioURL, OLD_URL);
    assert.equal(memory.read(COLLECTIONS.songVersions, 'ver-old')?.audioExpired, undefined);
    assert.deepEqual(seen.map((line) => line.split(' ')[1]), [OLD_URL, NEW_URL, NEW_URL]);
    assert.equal(seen[0], `HEAD ${OLD_URL}`);

    const rows = JSON.parse(readFileSync(summary.logJsonPath, 'utf8')) as Array<{
      songId: string;
      url: string;
      status: number;
      createdAt: string;
    }>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.songId, 'song-new');
    assert.equal(rows[0]?.url, NEW_URL);
    assert.equal(rows[0]?.status, 404);
    assert.equal(rows[0]?.createdAt, new Date(3_000).toISOString());
    const csv = readFileSync(summary.logCsvPath, 'utf8');
    assert.equal(csv.includes('song-new'), true);
    assert.equal(csv.includes(NEW_URL), true);
  });

  it('stops at --limit after the oldest MusicGPT song', async () => {
    const memory = createDb();
    await seedCatalog(memory);
    const { fetchImpl, seen } = probeFetch();
    const summary = await backfillSongAudio({
      db: memory.db,
      bucket: createBucket(),
      dryRun: true,
      limit: 1,
      projectLabel: 'stream-dev',
      logDir: mkdtempSync(join(tmpdir(), 'song-audio-limit-')),
      fetchImpl,
      pageSize: 1,
    });
    assert.equal(summary.songsScanned, 1);
    assert.equal(summary.stillOnMusicGpt, 1);
    assert.equal(summary.fetchable, 1);
    assert.deepEqual(seen, [`HEAD ${OLD_URL}`]);
    assert.equal(memory.writes.length, 0);
  });

  it('apply copies a fetchable MP3 and marks a gone file expired without deleting the URL', async () => {
    const memory = createDb();
    await memory.put(COLLECTIONS.songs, 'song-live', { createdAt: at(1_000) });
    await memory.put(COLLECTIONS.songs, 'song-dead', { createdAt: at(2_000) });
    await memory.put(COLLECTIONS.songVersions, 'ver-live', {
      songId: 'song-live',
      audioURL: OLD_URL,
      providerOutputId: 'conv-old',
    });
    await memory.put(COLLECTIONS.generations, 'gen-live', {
      songId: 'song-live',
      providerConversionIds: ['conv-old'],
      output: {
        audioURL: OLD_URL,
        stems: null,
        metadata: { conversion_conv_old: { conversion_path: OLD_URL } },
      },
    });
    await memory.put(COLLECTIONS.songVersions, 'ver-dead', {
      songId: 'song-dead',
      audioURL: NEW_URL,
      providerOutputId: 'conv-new',
    });

    const bucket = createBucket();
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === OLD_URL && method === 'GET') {
        return new Response('mp3', { status: 200 });
      }
      if (url === NEW_URL) return new Response('gone', { status: 404 });
      return new Response('no', { status: 500 });
    }) as typeof fetch;

    const summary = await backfillSongAudio({
      db: memory.db,
      bucket,
      dryRun: false,
      limit: null,
      projectLabel: 'stream-dev',
      logDir: mkdtempSync(join(tmpdir(), 'song-audio-apply-')),
      fetchImpl,
      pageSize: 10,
    });

    assert.equal(summary.migrated, 1);
    assert.equal(summary.fetchable, 1);
    assert.equal(summary.unfetchable, 1);
    assert.equal(summary.failed, 0);
    assert.deepEqual(bucket.saves, [songAudioObjectPath('song-live', 'conv-old')]);
    const token = bucket.files.get(songAudioObjectPath('song-live', 'conv-old'))?.token ?? '';
    const stored = firebaseAudioDownloadUrl(
      BUCKET,
      songAudioObjectPath('song-live', 'conv-old'),
      token
    );
    const version = memory.read(COLLECTIONS.songVersions, 'ver-live');
    assert.equal(version?.audioURL, stored);
    assert.equal(version?.musicgptAudioUrl, OLD_URL);
    assert.equal(version?.audioPersisted, true);
    assert.equal(version?.audioExpired, false);
    const generation = memory.read(COLLECTIONS.generations, 'gen-live');
    const output = generation?.output as { audioURL: string; metadata: { audioPersisted: boolean } };
    assert.equal(output.audioURL, stored);
    assert.equal(output.metadata.audioPersisted, true);

    const dead = memory.read(COLLECTIONS.songVersions, 'ver-dead');
    assert.equal(dead?.audioURL, NEW_URL);
    assert.equal(dead?.audioExpired, true);
    assert.equal(dead?.audioPersisted, false);
    assert.equal(dead?.musicgptAudioUrl, NEW_URL);
  });

  it('does not mark audioExpired when the download fails with a retryable status', async () => {
    const memory = createDb();
    await memory.put(COLLECTIONS.songs, 'song-live', { createdAt: at(1_000) });
    await memory.put(COLLECTIONS.songVersions, 'ver-live', {
      songId: 'song-live',
      audioURL: OLD_URL,
      providerOutputId: 'conv-old',
    });
    const fetchImpl = (async () => new Response('busy', { status: 503 })) as typeof fetch;
    const summary = await backfillSongAudio({
      db: memory.db,
      bucket: createBucket(),
      dryRun: false,
      limit: null,
      projectLabel: 'stream-dev',
      logDir: mkdtempSync(join(tmpdir(), 'song-audio-retry-')),
      fetchImpl,
    });
    assert.equal(summary.migrated, 0);
    assert.equal(summary.failed, 1);
    assert.equal(summary.unfetchable, 0);
    const version = memory.read(COLLECTIONS.songVersions, 'ver-live');
    assert.equal(version?.audioURL, OLD_URL);
    assert.equal(version?.audioExpired, undefined);
  });
});
