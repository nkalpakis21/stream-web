import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { selectArtistPageSongs, songShowsPrivateTag } from '../lib/artists/ownerSongs';
import { setAdminDbForTests } from '../lib/firebase/admin';
import { COLLECTIONS } from '../lib/firebase/collections';
import { adminAbandonOrphanSong } from '../lib/server/songsAdmin';
import { filterPublicShelf } from '../lib/songs/catalogAudio';
import {
  SONG_CREATE_IDEMPOTENCY_WINDOW_MS,
  SongCreateIdTaken,
  commitIdempotentSongCreate,
  runSongCreateAttempt,
  songCreateDocumentId,
} from '../lib/songs/songCreate';

type StoredSong = {
  id: string;
  ownerId: string;
  title: string;
  deletedAt: null | number;
  createdAtMs: number;
};

const OWNER = 'alice';
const KEY = '11111111-2222-4333-8444-555555555555';
const NOW = 1_700_000_000_000;

type ShelfSong = {
  id: string;
  title: string;
  isPublic: boolean;
  deletedAt: null | number;
  audioReady?: boolean;
  ownerId: string;
  createdAt: number;
};

function shelfSong(partial: Partial<ShelfSong> & Pick<ShelfSong, 'id'>): ShelfSong {
  return {
    title: partial.id,
    isPublic: true,
    deletedAt: null,
    ownerId: OWNER,
    createdAt: NOW,
    ...partial,
  };
}

describe('public shelves require playable audio', () => {
  it('hides a shell from New and lists a song once it has audio', () => {
    const shell = shelfSong({ id: 'mr-hanky', title: 'Mr hanky', audioReady: false });
    const legacyPlayable = shelfSong({ id: 'legacy-live', title: 'Already out' });
    const legacySilent = shelfSong({ id: 'legacy-empty', title: 'No file' });
    const expired = shelfSong({ id: 'legacy-dead', title: 'Expired' });
    const ready = shelfSong({ id: 'fresh', title: 'Fresh', audioReady: true });
    const versions = {
      'mr-hanky': [{ audioURL: null, isPrimary: true }],
      'legacy-live': [{ audioURL: 'https://cdn.example/live.mp3', isPrimary: true }],
      'legacy-empty': [{ audioURL: null, isPrimary: true }],
      'legacy-dead': [{ audioURL: 'https://cdn.example/dead.mp3', isPrimary: true, audioExpired: true }],
      fresh: [{ audioURL: 'https://cdn.example/fresh.mp3', isPrimary: true }],
    };
    const listed = filterPublicShelf(
      [shell, legacyPlayable, legacySilent, expired, ready],
      song => versions[song.id as keyof typeof versions]
    );
    assert.deepEqual(listed.map(song => song.id), ['legacy-live', 'fresh']);
  });

  it('keeps an older public song when the version read fails and still hides a shell', () => {
    const legacy = shelfSong({ id: 'legacy-live' });
    const shell = shelfSong({ id: 'mr-hanky', audioReady: false });
    const listed = filterPublicShelf([legacy, shell], () => null);
    assert.deepEqual(listed.map(song => song.id), ['legacy-live']);
  });

  it('keeps a generating song on the owner grid without a private tag', () => {
    const held = shelfSong({
      id: 'held',
      title: 'Mr hanky',
      isPublic: false,
      audioReady: false,
    });
    const withIntent = { ...held, publicOnReady: true as const };
    assert.deepEqual(
      selectArtistPageSongs([withIntent], OWNER, OWNER, 'band').map(song => song.id),
      ['held']
    );
    assert.equal(songShowsPrivateTag(withIntent, true), false);
    assert.deepEqual(
      selectArtistPageSongs([withIntent], 'bob', OWNER, 'band').map(song => song.id),
      []
    );
    assert.equal(
      selectArtistPageSongs(
        [shelfSong({ id: 'public-shell', audioReady: false })],
        'bob',
        OWNER,
        'band'
      ).length,
      0
    );
  });
});

describe('idempotent song create', () => {
  it('reuses the same song for a retry inside the window', async () => {
    const id = songCreateDocumentId(OWNER, KEY);
    assert.equal(id, `c_${OWNER}_${KEY}`);
    const store = new Map<string, StoredSong>();
    let autos = 0;

    async function create(nowMs: number) {
      return commitIdempotentSongCreate(
        {
          async get(songId) {
            return store.get(songId) ?? null;
          },
          async insert(song) {
            if (store.has(song.id)) throw new SongCreateIdTaken();
            store.set(song.id, song);
          },
          newId() {
            autos += 1;
            return `auto-${autos}`;
          },
        },
        {
          ownerId: OWNER,
          idempotencyKey: KEY,
          nowMs,
          identity: song => ({
            ownerId: song.ownerId,
            deletedAt: song.deletedAt,
            createdAtMs: song.createdAtMs,
          }),
          build(songId): StoredSong {
            return {
              id: songId,
              ownerId: OWNER,
              title: 'Mr hanky',
              deletedAt: null,
              createdAtMs: nowMs,
            };
          },
        }
      );
    }

    const first = await create(NOW);
    const second = await create(NOW + 1_000);
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(second.song.id, first.song.id);
    assert.equal(store.size, 1);

    const raced = await commitIdempotentSongCreate(
      {
        async get(songId) {
          return store.get(songId) ?? null;
        },
        async insert(song) {
          if (store.has(song.id)) throw new SongCreateIdTaken();
          store.set(song.id, song);
        },
        newId() {
          return 'should-not-run';
        },
      },
      {
        ownerId: OWNER,
        idempotencyKey: KEY,
        nowMs: NOW + 2_000,
        identity: song => ({
          ownerId: song.ownerId,
          deletedAt: song.deletedAt,
          createdAtMs: song.createdAtMs,
        }),
        build(): StoredSong {
          throw new Error('build should not run when the id is already taken by a live song');
        },
      }
    );
    assert.equal(raced.reused, true);
    assert.equal(raced.song.id, first.song.id);

    const later = await create(NOW + SONG_CREATE_IDEMPOTENCY_WINDOW_MS + 1);
    assert.equal(later.reused, false);
    assert.notEqual(later.song.id, first.song.id);
    assert.equal(store.size, 2);
  });
});

describe('rollback when generation fails', () => {
  it('soft-deletes the new shell and leaves a reused song alone', async () => {
    const abandoned: string[] = [];
    await assert.rejects(
      () =>
        runSongCreateAttempt({
          createSong: async () => ({ id: 'shell-1', reused: false }),
          createGeneration: async () => {
            throw new Error('MusicGPT down');
          },
          abandon: async songId => {
            abandoned.push(songId);
            return true;
          },
        }),
      /MusicGPT down/
    );
    assert.deepEqual(abandoned, ['shell-1']);

    const abandonedAgain: string[] = [];
    await assert.rejects(
      () =>
        runSongCreateAttempt({
          createSong: async () => ({ id: 'shell-1', reused: true }),
          createGeneration: async () => {
            throw new Error('MusicGPT down');
          },
          abandon: async songId => {
            abandonedAgain.push(songId);
            return true;
          },
        }),
      (error: unknown) => {
        assert.equal(abandonedAgain.length, 0);
        assert.equal(
          error instanceof Error && 'keepIdempotencyKey' in error
            ? (error as { keepIdempotencyKey: boolean }).keepIdempotencyKey
            : null,
          true
        );
        return true;
      }
    );
  });

  it('keeps the idempotency key when the shell delete does not land', async () => {
    await assert.rejects(
      () =>
        runSongCreateAttempt({
          createSong: async () => ({ id: 'shell-2', reused: false }),
          createGeneration: async () => {
            throw new Error('MusicGPT down');
          },
          abandon: async () => false,
        }),
      (error: unknown) =>
        error instanceof Error &&
        'keepIdempotencyKey' in error &&
        (error as { keepIdempotencyKey: boolean }).keepIdempotencyKey === true
    );
  });
});

type DocData = Record<string, unknown>;

function memoryAdmin() {
  const tables = new Map<string, Map<string, DocData>>();

  function rows(name: string): Map<string, DocData> {
    let table = tables.get(name);
    if (!table) {
      table = new Map();
      tables.set(name, table);
    }
    return table;
  }

  function docRef(name: string, id: string) {
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
        if (options?.merge && rows(name).has(id)) {
          rows(name).set(id, { ...rows(name).get(id), ...data });
        } else {
          rows(name).set(id, { ...data });
        }
      },
      async update(data: DocData) {
        const current = rows(name).get(id);
        if (!current) throw new Error(`missing ${name}/${id}`);
        rows(name).set(id, { ...current, ...data });
      },
    };
    return ref;
  }

  function query(name: string, filters: Array<{ field: string; value: unknown }>) {
    return {
      where(field: string, op: string, value: unknown) {
        if (op !== '==') throw new Error(`unsupported ${op}`);
        return query(name, [...filters, { field, value }]);
      },
      orderBy() {
        return query(name, filters);
      },
      async get() {
        const docs = [...rows(name).entries()]
          .filter(([, data]) => filters.every(filter => data[filter.field] === filter.value))
          .map(([id]) => {
            const ref = docRef(name, id);
            return { id, ref, data: () => ({ ...rows(name).get(id)! }) };
          });
        return { empty: docs.length === 0, docs };
      },
    };
  }

  return {
    db: {
      collection(name: string) {
        return {
          doc(id: string) {
            return docRef(name, id);
          },
          where(field: string, op: string, value: unknown) {
            return query(name, []).where(field, op, value);
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
    read(name: string, id: string) {
      return rows(name).get(id);
    },
  };
}

describe('admin abandon of an orphan song', () => {
  afterEach(() => {
    setAdminDbForTests(null);
  });

  it('soft-deletes a shell and leaves a song that already has audio', async () => {
    const memory = memoryAdmin();
    const createdAt = Timestamp.fromMillis(NOW);
    await memory.db.collection(COLLECTIONS.songs).doc('shell').set({
      id: 'shell',
      ownerId: OWNER,
      title: 'Mr hanky',
      isPublic: false,
      audioReady: false,
      publicOnReady: true,
      deletedAt: null,
      createdAt,
      updatedAt: createdAt,
    });
    await memory.db.collection(COLLECTIONS.songVersions).doc('ver-shell').set({
      id: 'ver-shell',
      songId: 'shell',
      versionNumber: 1,
      audioURL: null,
      isPrimary: true,
    });
    await memory.db.collection(COLLECTIONS.songs).doc('almost').set({
      id: 'almost',
      ownerId: OWNER,
      title: 'Almost',
      isPublic: false,
      audioReady: false,
      publicOnReady: true,
      deletedAt: null,
      createdAt,
      updatedAt: createdAt,
    });
    await memory.db.collection(COLLECTIONS.songVersions).doc('ver-almost').set({
      id: 'ver-almost',
      songId: 'almost',
      versionNumber: 1,
      audioURL: 'https://cdn.example/almost.mp3',
      isPrimary: true,
    });
    await memory.db.collection(COLLECTIONS.songs).doc('live').set({
      id: 'live',
      ownerId: OWNER,
      title: 'Live',
      isPublic: true,
      audioReady: true,
      deletedAt: null,
      createdAt,
      updatedAt: createdAt,
    });
    await memory.db.collection(COLLECTIONS.songVersions).doc('ver-live').set({
      id: 'ver-live',
      songId: 'live',
      versionNumber: 1,
      audioURL: 'https://cdn.example/live.mp3',
      isPrimary: true,
    });
    setAdminDbForTests(memory.db);

    assert.equal(await adminAbandonOrphanSong('shell', { prompt: 'a rainy chorus' }), 'deleted');
    assert.ok(memory.read(COLLECTIONS.songs, 'shell')?.deletedAt);
    assert.equal(memory.read(COLLECTIONS.songs, 'shell')?.generationStatus, 'failed');
    assert.equal(memory.read(COLLECTIONS.songs, 'shell')?.createPrompt, 'a rainy chorus');
    assert.equal(await adminAbandonOrphanSong('almost'), 'has-audio');
    assert.equal(memory.read(COLLECTIONS.songs, 'almost')?.deletedAt, null);
    assert.equal(await adminAbandonOrphanSong('live'), 'has-audio');
    assert.equal(memory.read(COLLECTIONS.songs, 'live')?.deletedAt, null);
    assert.equal(await adminAbandonOrphanSong('missing'), 'missing');
    assert.equal(await adminAbandonOrphanSong('shell'), 'deleted');
  });
});
