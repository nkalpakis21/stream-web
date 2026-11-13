import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { setAdminDbForTests } from '../lib/firebase/admin';
import { COLLECTIONS } from '../lib/firebase/collections';
import {
  isClientFunnelEvent,
  isFunnelEvent,
  sanitizeFunnelProps,
  setFunnelStoreForTests,
  type FunnelStore,
} from '../lib/server/funnel';
import { processMusicGptWebhook } from '../lib/server/musicgptWebhook';
import { setSongAudioStorageDepsForTests, type SongAudioBucket, type SongAudioFile } from '../lib/server/songAudioStorage';
import {
  keepVoiceChange,
  noteVoiceSplitFailed,
  setVoiceChangeDepsForTests,
  startVoiceChange,
} from '../lib/server/voiceChange';
import { HttpError } from '../lib/api/requireAuth';
import {
  CHANGE_VOICE_ERROR,
  NO_VOICE_CHANGES_LABEL,
  VOICE_CHANGE_CAP,
  buildVoiceCompareRows,
  countsTowardSongQuota,
  currentSungGender,
  defaultVoiceSelection,
  msBetween,
  otherVoiceChoice,
  readSongDurationSeconds,
  resolveStoredInstrumental,
  savedLyricsText,
  shouldOfferVoiceChange,
  voiceChangeActionLabel,
  voiceChangeSnapshot,
  voiceChangeSplitsBeat,
  type VoiceGenerationRef,
  type VoiceVersionRef,
} from '../lib/songs/voiceChange';

process.env.WEBHOOK_BASE_URL = 'https://streamstar.example';
process.env.MUSICGPT_WEBHOOK_SECRET = 'test-secret';

type DocData = Record<string, unknown>;

function memoryDb() {
  const tables = new Map<string, Map<string, DocData>>();

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
    return {
      id,
      async get() {
        const data = rows(name).get(id);
        return {
          id,
          exists: data !== undefined,
          data: () => (data ? { ...data } : undefined),
          ref: docRef(name, id),
        };
      },
      async set(data: DocData, options?: { merge?: boolean }) {
        if (options?.merge && rows(name).has(id)) rows(name).set(id, { ...rows(name).get(id), ...data });
        else rows(name).set(id, { ...data, id: data.id ?? id });
      },
      async update(data: DocData) {
        const current = rows(name).get(id);
        if (!current) throw new Error(`missing ${name}/${id}`);
        rows(name).set(id, { ...current, ...data });
      },
    };
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
        return { empty: docs.length === 0, docs };
      },
    };
  }

  const db = {
    collection(name: string) {
      return {
        doc(id?: string) {
          return docRef(name, id ?? `auto-${name}-${rows(name).size + 1}`);
        },
        where(field: string, op: string, value: unknown) {
          return query(name, [], null, 'asc').where(field, op, value);
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
    async runTransaction<T>(fn: (tx: {
      get: (ref: ReturnType<typeof docRef>) => Promise<{ exists: boolean; data: () => DocData | undefined }>;
      set: (ref: ReturnType<typeof docRef>, data: DocData, options?: { merge?: boolean }) => void;
    }) => Promise<T>): Promise<T> {
      const ops: Array<() => Promise<void>> = [];
      const result = await fn({
        get(ref) {
          return ref.get();
        },
        set(ref, data, options) {
          ops.push(() => ref.set(data, options));
        },
      });
      for (const op of ops) await op();
      return result;
    },
  };

  return {
    db,
    async put(name: string, id: string, data: DocData) {
      await docRef(name, id).set({ ...data, id });
    },
    read(name: string, id: string) {
      return rows(name).get(id);
    },
    ids(name: string) {
      return [...rows(name).keys()];
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

const BEAT_URL = 'https://firebasestorage.googleapis.com/v0/b/demo/o/beat.mp3';
const VOCAL_URL = 'https://firebasestorage.googleapis.com/v0/b/demo/o/vocal.mp3';

function song(extra?: DocData): DocData {
  return {
    id: 'song-1',
    ownerId: 'owner-1',
    artistId: 'artist-1',
    artistVersionId: 'av-1',
    title: 'Night Drive',
    isPublic: true,
    audioReady: true,
    deletedAt: null,
    currentVersionId: 'ver-vocal',
    createPrompt: 'a night drive',
    createOptions: {
      instrumental: false,
      voice: 'same',
      feel: ['Chill'],
      energy: 'Slow',
      words: 'mine',
    },
    path: 'beat_first',
    beatFirst: {
      stage: 'vocals',
      retriesUsed: 0,
      chosenVersionId: 'ver-beat',
      vocalsAdded: true,
    },
    singOver: { attempts: 1, creditEstimate: 0.04 },
    ...extra,
  };
}

function version(id: string, url: string, output: string, primary: boolean, number: number): DocData {
  return {
    id,
    songId: 'song-1',
    versionNumber: number,
    title: 'Night Drive',
    createdBy: 'owner-1',
    audioURL: url,
    providerOutputId: output,
    isPrimary: primary,
    createdAt: Timestamp.fromMillis(1_700_000_000_000),
    parentVersionId: null,
  };
}

const lyricsGeneration: DocData = {
  id: 'gen-vocal',
  songId: 'song-1',
  status: 'completed',
  provider: 'musicgpt',
  providerConversionIds: ['conv-vocal'],
  providerFailedConversions: [],
  parameters: { job: 'sing_over', sourceVersionId: 'ver-beat' },
  createdAt: Timestamp.fromMillis(1_700_000_100_000),
  output: {
    audioURL: VOCAL_URL,
    stems: ['https://cdn.example/full-mix.wav'],
    metadata: { 'conversion_conv-vocal': { lyrics: '[Verse]\nhello night' } },
  },
};

async function seedReady(memory: ReturnType<typeof memoryDb>, extra?: DocData) {
  await memory.put(COLLECTIONS.songs, 'song-1', song(extra));
  await memory.put(COLLECTIONS.songVersions, 'ver-beat', version('ver-beat', BEAT_URL, 'conv-beat', false, 1));
  await memory.put(COLLECTIONS.songVersions, 'ver-vocal', version('ver-vocal', VOCAL_URL, 'conv-vocal', true, 2));
  await memory.put(COLLECTIONS.generations, 'gen-vocal', lyricsGeneration);
  await memory.put(COLLECTIONS.generations, 'gen-beat', {
    id: 'gen-beat',
    songId: 'song-1',
    status: 'completed',
    providerConversionIds: ['conv-beat'],
    parameters: { job: 'beat' },
    createdAt: Timestamp.fromMillis(1_700_000_000_000),
    output: { audioURL: BEAT_URL, stems: null, metadata: {} },
  });
  setAdminDbForTests(memory.db);
}

afterEach(() => {
  setAdminDbForTests(null);
  setFunnelStoreForTests(null);
  setVoiceChangeDepsForTests(null);
  setSongAudioStorageDepsForTests(null);
});

describe('voice change rules', () => {
  it('caps a song at two changes and does not charge a song quota', () => {
    assert.equal(VOICE_CHANGE_CAP, 2);
    assert.equal(countsTowardSongQuota(), false);
    assert.equal(voiceChangeActionLabel(0), 'Change the voice (2 left)');
    assert.equal(voiceChangeActionLabel(1), 'Change the voice (1 left)');
    assert.equal(voiceChangeActionLabel(2), NO_VOICE_CHANGES_LABEL);
    assert.equal(currentSungGender({ songVoice: 'female', artistVoice: 'a man' }), 'female');
    assert.equal(currentSungGender({ songVoice: 'same', artistVoice: 'a woman with a low tone' }), 'female');
    assert.equal(otherVoiceChoice('female'), 'male');
    assert.equal(otherVoiceChoice('male'), 'female');
    assert.equal(currentSungGender({ songVoice: 'same', artistVoice: 'warm alto' }), null);
    assert.equal(currentSungGender({ songVoice: null, artistVoice: null }), null);
    assert.equal(defaultVoiceSelection('1', 'failed', 'ready'), '2');
    assert.equal(defaultVoiceSelection('1', 'ready', 'ready'), '1');
    assert.equal(defaultVoiceSelection('original', 'failed', 'ready'), 'original');
    assert.equal(msBetween(1_000, 5_000), 4000);
    assert.equal(CHANGE_VOICE_ERROR, "Couldn't change the voice.");
  });

  it('uses the stored beat and ignores a vocal mix and a full-mix wav', () => {
    const versions: VoiceVersionRef[] = [
      { id: 'ver-beat', audioURL: BEAT_URL, providerOutputId: 'conv-beat', versionNumber: 1 },
      { id: 'ver-vocal', audioURL: VOCAL_URL, providerOutputId: 'conv-vocal', isPrimary: true, versionNumber: 2 },
    ];
    const generations: VoiceGenerationRef[] = [
      {
        id: 'gen-vocal',
        status: 'completed',
        createdAtMs: 2,
        parameters: { job: 'sing_over', sourceVersionId: 'ver-beat' },
        output: { stems: ['https://cdn.example/full-mix.wav'], metadata: {} },
      },
    ];
    const chosen = resolveStoredInstrumental({
      song: { beatFirst: { chosenVersionId: 'ver-beat', stage: 'vocals' }, currentVersionId: 'ver-vocal' },
      versions,
      generations,
    });
    assert.deepEqual(chosen, { versionId: 'ver-beat', audioUrl: BEAT_URL });

    const fromSource = resolveStoredInstrumental({
      song: { currentVersionId: 'ver-vocal' },
      versions,
      generations,
    });
    assert.equal(fromSource?.versionId, 'ver-beat');

    const vocalOnly = resolveStoredInstrumental({
      song: { currentVersionId: 'ver-vocal', createOptions: { instrumental: false } },
      versions: [versions[1]],
      generations: [
        {
          id: 'gen-song',
          status: 'completed',
          parameters: { job: undefined },
          output: { stems: ['https://cdn.example/full-mix.wav'], metadata: {} },
        },
      ],
    });
    assert.equal(vocalOnly, null);

    const instrumentalFile = resolveStoredInstrumental({
      song: {
        currentVersionId: 'ver-vocal',
        createOptions: { instrumental: true },
        beatFirst: { stage: 'instrumental' },
      },
      versions: [{ id: 'ver-vocal', audioURL: BEAT_URL, isPrimary: true }],
      generations: [],
    });
    assert.equal(instrumentalFile?.audioUrl, BEAT_URL);
  });

  it('reads saved lyrics from generation metadata and hides the action without them', () => {
    const text = savedLyricsText(
      [
        {
          status: 'completed',
          createdAtMs: 2,
          output: { metadata: { 'conversion_conv-vocal': { lyrics: '  hello night  ' } } },
        },
      ],
      'conv-vocal'
    );
    assert.equal(text, 'hello night');
    assert.equal(savedLyricsText([{ status: 'completed', output: { metadata: {} } }], null), null);
    assert.equal(
      shouldOfferVoiceChange({
        beatFirst: true,
        instrumental: true,
        lyrics: 'hello',
        source: { versionId: 'ver-beat' },
        used: 0,
        status: null,
      }),
      false
    );
    assert.equal(
      shouldOfferVoiceChange({
        beatFirst: true,
        instrumental: false,
        lyrics: null,
        source: { versionId: 'ver-beat' },
        used: 0,
        status: null,
      }),
      false
    );
    assert.equal(
      shouldOfferVoiceChange({
        beatFirst: true,
        instrumental: false,
        lyrics: 'hello',
        source: null,
        used: 0,
        status: null,
      }),
      false
    );
    assert.equal(
      shouldOfferVoiceChange({
        beatFirst: true,
        instrumental: false,
        lyrics: 'hello',
        source: { versionId: 'ver-beat' },
        used: 2,
        status: null,
      }),
      true
    );
    assert.equal(
      shouldOfferVoiceChange({
        beatFirst: false,
        instrumental: false,
        lyrics: 'hello',
        source: { versionId: 'ver-mix' },
        used: 0,
        status: null,
      }),
      true
    );
    assert.equal(
      shouldOfferVoiceChange({
        beatFirst: false,
        instrumental: false,
        lyrics: null,
        source: { versionId: 'ver-mix' },
        used: 0,
        status: null,
      }),
      false
    );
    assert.equal(
      shouldOfferVoiceChange({
        beatFirst: false,
        instrumental: true,
        lyrics: 'hello',
        source: { versionId: 'ver-mix' },
        used: 0,
        status: null,
      }),
      false
    );
    assert.equal(
      shouldOfferVoiceChange({
        beatFirst: false,
        instrumental: false,
        lyrics: 'hello',
        source: { versionId: 'ver-mix' },
        used: 0,
        status: null,
        durationSeconds: 241,
      }),
      false
    );
    assert.equal(
      shouldOfferVoiceChange({
        beatFirst: false,
        instrumental: false,
        lyrics: 'hello',
        source: { versionId: 'ver-mix' },
        used: 0,
        status: null,
        durationSeconds: 240,
      }),
      true
    );
    assert.equal(
      shouldOfferVoiceChange({
        beatFirst: true,
        instrumental: false,
        lyrics: 'hello',
        source: { versionId: 'ver-beat' },
        used: 0,
        status: null,
        durationSeconds: 300,
      }),
      true
    );
    assert.equal(
      shouldOfferVoiceChange({
        beatFirst: false,
        instrumental: false,
        lyrics: 'hello',
        source: null,
        used: 0,
        status: null,
      }),
      false
    );
    assert.equal(
      shouldOfferVoiceChange({
        beatFirst: false,
        instrumental: false,
        lyrics: 'hello',
        source: { versionId: 'ver-mix' },
        used: 0,
        status: null,
        audioReady: false,
      }),
      false
    );
  });

  it('builds Original and two new-voice rows', () => {
    const rows = buildVoiceCompareRows({
      originalVersionId: 'ver-vocal',
      originalAudioUrl: VOCAL_URL,
      conversionIds: ['nv-1', 'nv-2'],
      failedConversionIds: ['nv-2'],
      versions: [
        { id: 'ver-vocal', audioURL: VOCAL_URL, providerOutputId: 'conv-vocal' },
        { id: 'ver-new', audioURL: 'https://cdn.example/new.mp3', providerOutputId: 'nv-1' },
      ],
    });
    assert.deepEqual(
      rows.map((row) => [row.label, row.status, row.versionId]),
      [
        ['Original', 'ready', 'ver-vocal'],
        ['New voice 1', 'ready', 'ver-new'],
        ['New voice 2', 'failed', null],
      ]
    );
    const snapshot = voiceChangeSnapshot({
      song: {
        path: 'beat_first',
        currentVersionId: 'ver-vocal',
        createOptions: { instrumental: false },
        beatFirst: { stage: 'vocals', chosenVersionId: 'ver-beat' },
        voiceChange: { used: 1, status: 'making', voice: 'female', generationId: 'gen-new', originalVersionId: 'ver-vocal' },
      },
      versions: [
        { id: 'ver-beat', audioURL: BEAT_URL, providerOutputId: 'conv-beat' },
        { id: 'ver-vocal', audioURL: VOCAL_URL, providerOutputId: 'conv-vocal', isPrimary: true },
      ],
      generations: [
        {
          id: 'gen-vocal',
          status: 'completed',
          createdAtMs: 1,
          providerConversionIds: ['conv-vocal'],
          parameters: { job: 'sing_over', sourceVersionId: 'ver-beat' },
          output: { metadata: { 'conversion_conv-vocal': { lyrics: 'hello night' } } },
        },
        {
          id: 'gen-new',
          status: 'pending',
          createdAtMs: 2,
          providerConversionIds: ['nv-1', 'nv-2'],
          parameters: { job: 'sing_over', purpose: 'voice_change' },
          output: { metadata: {} },
        },
      ],
    });
    assert.equal(snapshot.show, true);
    assert.deepEqual(snapshot.conversionIds, ['nv-1', 'nv-2']);
  });

  it('keeps voice_change server-only and stores the voice and whether it was kept', () => {
    assert.equal(isFunnelEvent('voice_change'), true);
    assert.equal(isClientFunnelEvent('voice_change'), false);
    assert.equal(isFunnelEvent('first_song_started'), true);
    assert.deepEqual(
      sanitizeFunnelProps({
        songId: 'song-1',
        artistId: 'artist-1',
        voice: 'female',
        kept: true,
        msToKeep: 240000,
        lyrics: 'secret',
        audioUrl: VOCAL_URL,
      }),
      { songId: 'song-1', artistId: 'artist-1', voice: 'female', kept: true, msToKeep: 240000 }
    );
    assert.deepEqual(
      sanitizeFunnelProps({
        voice: 'female',
        kept: true,
        source: 'split',
        split: true,
      }),
      { voice: 'female', kept: true, source: 'split', split: true }
    );
    assert.deepEqual(
      sanitizeFunnelProps({
        voice: 'male',
        kept: false,
        source: 'beat_first',
        split: false,
      }),
      { voice: 'male', kept: false, source: 'beat_first', split: false }
    );
    assert.deepEqual(
      sanitizeFunnelProps({ source: 'youtube', split: 'yes', voice: 'neutral', kept: 'yes', msToKeep: -1 }),
      {}
    );
  });
});

describe('voice change server', () => {
  it('sings over the stored beat, leaves the song count alone, and does not start a song', async () => {
    const memory = memoryDb();
    await seedReady(memory);
    const funnel = funnelMemory();
    setFunnelStoreForTests(funnel.store);
    const calls: Array<{ sourceAudioUrl: string; lyrics: string; voice: string; prompt: string }> = [];
    setVoiceChangeDepsForTests({
      async submit(input) {
        calls.push({
          sourceAudioUrl: input.sourceAudioUrl,
          lyrics: input.lyrics,
          voice: input.voice,
          prompt: input.prompt,
        });
        return {
          result: {
            taskId: 'task-voice',
            conversionIds: ['nv-1', 'nv-2'],
            creditEstimate: 0.04,
            raw: { task_id: 'task-voice' },
          },
          account: { attempts: 2, creditEstimate: 0.08 },
        };
      },
      async saveBinding() {},
    });

    const started = await startVoiceChange({
      songId: 'song-1',
      uid: 'owner-1',
      voice: 'vesper',
      platform: 'web',
    });
    assert.equal(started.used, 1);
    assert.equal(memory.ids(COLLECTIONS.songs).length, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].sourceAudioUrl, BEAT_URL);
    assert.equal(calls[0].lyrics, '[Verse]\nhello night');
    assert.equal(calls[0].voice, 'female');
    assert.ok(calls[0].prompt.startsWith('low, smoky female vocal, warm chest tone, slow intimate delivery'));
    assert.match(calls[0].prompt, /a night drive/);
    assert.notEqual(calls[0].prompt, 'low, smoky female vocal, warm chest tone, slow intimate delivery');
    const stored = memory.read(COLLECTIONS.songs, 'song-1')?.voiceChange as { used: number; status: string; voice: string };
    assert.equal(stored.used, 1);
    assert.equal(stored.status, 'making');
    assert.equal(stored.voice, 'vesper');
    const generation = [...memory.ids(COLLECTIONS.generations)]
      .map((id) => memory.read(COLLECTIONS.generations, id))
      .find((item) => (item?.parameters as { purpose?: string } | undefined)?.purpose === 'voice_change');
    assert.equal((generation?.parameters as { job?: string }).job, 'sing_over');
    assert.equal(memory.read(COLLECTIONS.songs, 'song-1')?.currentVersionId, 'ver-vocal');
    assert.equal(funnel.docs.some((doc) => doc.data.event === 'first_song_started'), false);
    assert.equal(funnel.docs.some((doc) => doc.data.event === 'voice_change'), false);

    await memory.put(
      COLLECTIONS.songVersions,
      'ver-new',
      version('ver-new', 'https://cdn.example/new.mp3', 'nv-1', false, 3)
    );
    const kept = await keepVoiceChange({
      songId: 'song-1',
      uid: 'owner-1',
      versionId: 'ver-new',
      platform: 'web',
    });
    assert.equal(kept.kept, true);
    assert.equal(memory.read(COLLECTIONS.songs, 'song-1')?.currentVersionId, 'ver-new');
    assert.equal(memory.read(COLLECTIONS.songVersions, 'ver-vocal')?.isPrimary, false);
    assert.equal(memory.read(COLLECTIONS.songVersions, 'ver-vocal')?.audioURL, VOCAL_URL);
    assert.equal(memory.read(COLLECTIONS.songVersions, 'ver-beat')?.audioURL, BEAT_URL);
    assert.equal((memory.read(COLLECTIONS.songs, 'song-1')?.voiceChange as { used: number; status: null }).used, 1);
    assert.equal(funnel.docs.length, 1);
    assert.equal(funnel.docs[0].data.event, 'voice_change');
    const props = funnel.docs[0].data.props as {
      voice: string;
      kept: boolean;
      msToKeep: number;
      source: string;
      split: boolean;
    };
    assert.equal(props.voice, 'vesper');
    assert.equal(props.kept, true);
    assert.equal(props.source, 'beat_first');
    assert.equal(props.split, false);
    assert.equal(typeof props.msToKeep, 'number');
    assert.ok(props.msToKeep >= 0);
  });

  it('keeps the original without swapping audio and records kept false', async () => {
    const memory = memoryDb();
    await seedReady(memory, {
      voiceChange: {
        used: 1,
        status: 'ready',
        voice: 'male',
        generationId: 'gen-new',
        originalVersionId: 'ver-vocal',
        sourceVersionId: 'ver-beat',
      },
    });
    await memory.put(COLLECTIONS.generations, 'gen-new', {
      id: 'gen-new',
      songId: 'song-1',
      status: 'completed',
      providerConversionIds: ['nv-1', 'nv-2'],
      parameters: { job: 'sing_over', purpose: 'voice_change' },
      createdAt: Timestamp.fromMillis(1_700_000_200_000),
      output: { audioURL: null, stems: null, metadata: {} },
    });
    const funnel = funnelMemory();
    setFunnelStoreForTests(funnel.store);
    const result = await keepVoiceChange({
      songId: 'song-1',
      uid: 'owner-1',
      versionId: null,
      platform: 'ios',
    });
    assert.equal(result.kept, false);
    assert.equal(memory.read(COLLECTIONS.songs, 'song-1')?.currentVersionId, 'ver-vocal');
    assert.deepEqual(funnel.docs[0].data.props, {
      songId: 'song-1',
      artistId: 'artist-1',
      voice: 'male',
      kept: false,
      source: 'beat_first',
      split: false,
    });
  });

  it('refuses a third change, a vocal mix, an instrumental, and a missing prompt', async () => {
    const memory = memoryDb();
    await seedReady(memory, { voiceChange: { used: 2, status: null } });
    setVoiceChangeDepsForTests({
      async submit() {
        throw new Error('should not sing');
      },
    });
    await assert.rejects(
      () => startVoiceChange({ songId: 'song-1', uid: 'owner-1', voice: 'vesper', platform: 'web' }),
      (error: unknown) => error instanceof HttpError && error.status === 409 && error.message === 'No voice changes left'
    );

    await memory.put(COLLECTIONS.songs, 'song-1', song({ voiceChange: { used: 0, status: null } }));
    await memory.put(COLLECTIONS.songVersions, 'ver-beat', version('ver-beat', '', 'conv-beat', false, 1));
    await memory.put(COLLECTIONS.songs, 'song-1', song({
      beatFirst: { stage: 'vocals', chosenVersionId: null, retriesUsed: 0 },
      voiceChange: null,
    }));
    await memory.put(COLLECTIONS.generations, 'gen-vocal', {
      ...lyricsGeneration,
      parameters: { job: 'sing_over' },
    });
    await memory.put(COLLECTIONS.generations, 'gen-beat', {
      id: 'gen-beat',
      songId: 'song-1',
      status: 'completed',
      parameters: {},
      createdAt: Timestamp.fromMillis(1),
      output: { stems: ['https://cdn.example/full-mix.wav'], metadata: { 'conversion_conv-vocal': { lyrics: 'hello' } } },
    });
    await assert.rejects(
      () => startVoiceChange({ songId: 'song-1', uid: 'owner-1', voice: 'same', platform: 'web' }),
      (error: unknown) => error instanceof HttpError && error.message === 'No separable beat for this song'
    );

    await memory.put(COLLECTIONS.songs, 'song-1', song({
      createOptions: { instrumental: true, voice: 'same', feel: [], energy: 'Steady', words: 'artist' },
      beatFirst: { stage: 'instrumental', chosenVersionId: 'ver-beat' },
    }));
    await assert.rejects(
      () => startVoiceChange({ songId: 'song-1', uid: 'owner-1', voice: 'vesper', platform: 'web' }),
      (error: unknown) => error instanceof HttpError && error.message === 'This song is instrumental'
    );

    await memory.put(COLLECTIONS.songs, 'song-1', song({ path: null, duration: 241 }));
    await assert.rejects(
      () => startVoiceChange({ songId: 'song-1', uid: 'owner-1', voice: 'vesper', platform: 'web' }),
      (error: unknown) =>
        error instanceof HttpError && error.status === 400 && error.message === 'This song is too long to change the voice'
    );

    await memory.put(COLLECTIONS.songVersions, 'ver-beat', version('ver-beat', BEAT_URL, 'conv-beat', false, 1));
    await memory.put(COLLECTIONS.songs, 'song-1', song({
      createPrompt: '   ',
      createOptions: null,
      beatFirst: { stage: 'vocals', chosenVersionId: 'ver-beat', retriesUsed: 0, vocalsAdded: true },
      voiceChange: null,
    }));
    await assert.rejects(
      () => startVoiceChange({ songId: 'song-1', uid: 'owner-1', voice: 'vesper', platform: 'web' }),
      (error: unknown) => error instanceof HttpError && error.message === 'Add a prompt first.'
    );
    assert.equal((memory.read(COLLECTIONS.songs, 'song-1')?.voiceChange as { used?: number } | undefined)?.used ?? 0, 0);
  });

  it('gives the change back when Sing Over rejects the upload', async () => {
    const memory = memoryDb();
    await seedReady(memory);
    setVoiceChangeDepsForTests({
      async submit() {
        throw new Error('Sing Over request failed with status 500');
      },
    });
    await assert.rejects(() =>
      startVoiceChange({ songId: 'song-1', uid: 'owner-1', voice: 'vesper', platform: 'web' })
    );
    const stored = memory.read(COLLECTIONS.songs, 'song-1')?.voiceChange as { used: number; status: string | null };
    assert.equal(stored.used, 0);
    assert.equal(stored.status, null);
    assert.equal(memory.ids(COLLECTIONS.songs).length, 1);
  });
});

const MIX_URL = 'https://firebasestorage.googleapis.com/v0/b/demo/o/mix.mp3';
const SPLIT_INSTRUMENTAL = 'https://cdn1.musicgpt.com/conversions/instrumental.mp3';

function normalSong(extra?: DocData): DocData {
  return {
    id: 'song-1',
    ownerId: 'owner-1',
    artistId: 'artist-1',
    artistVersionId: 'av-1',
    title: 'Night Drive',
    isPublic: true,
    audioReady: true,
    deletedAt: null,
    currentVersionId: 'ver-mix',
    createPrompt: 'a night drive',
    createOptions: {
      instrumental: false,
      voice: 'same',
      feel: ['Chill'],
      energy: 'Slow',
      words: 'mine',
    },
    path: null,
    duration: 180,
    ...extra,
  };
}

async function seedNormal(memory: ReturnType<typeof memoryDb>, extra?: DocData) {
  await memory.put(COLLECTIONS.songs, 'song-1', normalSong(extra));
  await memory.put(
    COLLECTIONS.songVersions,
    'ver-mix',
    version('ver-mix', MIX_URL, 'conv-mix', true, 1)
  );
  await memory.put(COLLECTIONS.generations, 'gen-mix', {
    id: 'gen-mix',
    songId: 'song-1',
    status: 'completed',
    provider: 'musicgpt',
    providerConversionIds: ['conv-mix'],
    providerFailedConversions: [],
    parameters: {},
    createdAt: Timestamp.fromMillis(1_700_000_000_000),
    output: {
      audioURL: MIX_URL,
      stems: null,
      metadata: { 'conversion_conv-mix': { lyrics: '[Verse]\nhello night' } },
    },
  });
  setAdminDbForTests(memory.db);
}

function storageBucket(): SongAudioBucket {
  const files = new Map<string, { token: string }>();
  return {
    name: 'stream-dev-48098.firebasestorage.app',
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
        async save(_data, options) {
          files.set(objectPath, {
            token: options.metadata?.metadata?.firebaseStorageDownloadTokens ?? 'token',
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

describe('voice change on a normal song', () => {
  it('hides the button with no lyrics, over 4 minutes, and shows the split caveat only off beat-first', () => {
    assert.equal(voiceChangeSplitsBeat('beat_first'), false);
    assert.equal(voiceChangeSplitsBeat(null), true);
    assert.equal(voiceChangeSplitsBeat(undefined), true);
    const versions: VoiceVersionRef[] = [
      { id: 'ver-mix', audioURL: MIX_URL, providerOutputId: 'conv-mix', isPrimary: true },
    ];
    const withLyrics = voiceChangeSnapshot({
      song: { path: null, currentVersionId: 'ver-mix', audioReady: true, duration: 180, createOptions: { instrumental: false } },
      versions,
      generations: [
        {
          status: 'completed',
          createdAtMs: 1,
          output: { metadata: { conversion_conv_mix: { lyrics: 'hello night' } } },
        },
      ],
    });
    assert.equal(withLyrics.show, true);
    assert.equal(
      readSongDurationSeconds({
        duration: null,
        conversionId: 'conv-mix',
        generations: [
          {
            createdAtMs: 1,
            output: { metadata: { 'conversion_conv-mix': { conversion_duration: 301 } } },
          },
        ],
      }),
      301
    );
    const noLyrics = voiceChangeSnapshot({
      song: { path: null, currentVersionId: 'ver-mix', audioReady: true, duration: 180 },
      versions,
      generations: [{ status: 'completed', createdAtMs: 1, output: { metadata: {} } }],
    });
    assert.equal(noLyrics.show, false);
    const tooLong = voiceChangeSnapshot({
      song: { path: null, currentVersionId: 'ver-mix', audioReady: true },
      versions,
      generations: [
        {
          status: 'completed',
          createdAtMs: 2,
          output: { metadata: { conversion_conv_mix: { lyrics: 'hello night', conversion_duration: 301 } } },
        },
      ],
    });
    assert.equal(tooLong.show, false);
    const beatFirstLong = voiceChangeSnapshot({
      song: {
        path: 'beat_first',
        currentVersionId: 'ver-vocal',
        duration: 400,
        createOptions: { instrumental: false },
        beatFirst: { stage: 'vocals', chosenVersionId: 'ver-beat' },
      },
      versions: [
        { id: 'ver-beat', audioURL: BEAT_URL, providerOutputId: 'conv-beat' },
        { id: 'ver-vocal', audioURL: VOCAL_URL, providerOutputId: 'conv-vocal', isPrimary: true },
      ],
      generations: [
        {
          status: 'completed',
          createdAtMs: 1,
          parameters: { job: 'sing_over', sourceVersionId: 'ver-beat' },
          output: { metadata: { conversion_conv_vocal: { lyrics: 'hello night' } } },
        },
      ],
    });
    assert.equal(beatFirstLong.show, true);
  });

  it('splits the mix, sings over the cached instrumental, and shares the cap', async () => {
    const memory = memoryDb();
    await seedNormal(memory);
    const splits: string[] = [];
    const sings: string[] = [];
    setVoiceChangeDepsForTests({
      async split(input) {
        splits.push(input.sourceAudioUrl);
        return {
          taskId: 'task-split',
          conversionId: 'conv-split',
          creditEstimate: 0,
          isFreePromo: true,
          raw: { task_id: 'task-split', credit_estimate: 0, is_free_promo: true },
        };
      },
      async submit(input) {
        sings.push(input.sourceAudioUrl);
        return {
          result: {
            taskId: 'task-voice',
            conversionIds: ['nv-1', 'nv-2'],
            creditEstimate: 0.05,
            raw: { task_id: 'task-voice', credit_estimate: 0.05 },
          },
          account: { attempts: 1, creditEstimate: 0.05 },
        };
      },
    });
    setSongAudioStorageDepsForTests({
      bucket: storageBucket(),
      fetchImpl: (async () => new Response('mp3', { status: 200 })) as typeof fetch,
    });

    const started = await startVoiceChange({
      songId: 'song-1',
      uid: 'owner-1',
      voice: 'vesper',
      platform: 'web',
    });
    assert.equal(started.used, 0);
    assert.deepEqual(splits, [MIX_URL]);
    assert.equal(sings.length, 0);
    const making = memory.read(COLLECTIONS.songs, 'song-1');
    const makingVoice = making?.voiceChange as { used: number; status: string };
    assert.equal(makingVoice.used, 0);
    assert.equal(makingVoice.status, 'making');
    const splitting = making?.voiceSplit as { status: string; creditEstimate: number; audioUrl: string | null };
    assert.equal(splitting.status, 'splitting');
    assert.equal(splitting.creditEstimate, 0);
    assert.equal(splitting.audioUrl, null);
    const splitGeneration = [...memory.ids(COLLECTIONS.generations)]
      .map((id) => memory.read(COLLECTIONS.generations, id))
      .find((item) => (item?.parameters as { job?: string } | undefined)?.job === 'stem_split');
    assert.equal((splitGeneration?.parameters as { purpose?: string }).purpose, 'voice_split');
    assert.equal((splitGeneration?.parameters as { stemPreset?: string }).stemPreset, '2_stems');
    assert.equal((splitGeneration?.parameters as { stems?: unknown }).stems, undefined);
    assert.equal(memory.read(COLLECTIONS.songs, 'song-1')?.currentVersionId, 'ver-mix');

    const webhook = await processMusicGptWebhook({
      success: true,
      conversion_type: 'Extraction',
      task_id: 'task-split',
      conversion_id: 'conv-split',
      audio_url: JSON.stringify({
        vocals: 'https://cdn1.musicgpt.com/conversions/vocals.mp3',
        instrumental: SPLIT_INSTRUMENTAL,
      }),
      credit_estimate: 0,
      conversion_cost: 0,
    });
    assert.equal(webhook.status, 200);
    assert.equal(sings.length, 1);
    assert.notEqual(sings[0], MIX_URL);
    assert.match(sings[0], /firebasestorage\.googleapis\.com/);
    const sung = memory.read(COLLECTIONS.songs, 'song-1');
    const sungVoice = sung?.voiceChange as { used: number; status: string; generationId: string };
    assert.equal(sungVoice.used, 1);
    assert.equal(sungVoice.status, 'making');
    const cached = sung?.voiceSplit as { status: string; audioUrl: string; creditEstimate: number };
    assert.equal(cached.status, 'ready');
    assert.equal(cached.audioUrl, sings[0]);
    assert.equal(cached.creditEstimate, 0);
    assert.equal(sung?.currentVersionId, 'ver-mix');
    assert.deepEqual(memory.ids(COLLECTIONS.songVersions), ['ver-mix']);
    const usage = memory.read(COLLECTIONS.generations, String(splitGeneration?.id))?.musicGptUsage as {
      creditEstimate: number;
      chargedCost: number;
    };
    assert.equal(usage.creditEstimate, 0);
    assert.equal(usage.chargedCost, 0);
    const voiceGeneration = [...memory.ids(COLLECTIONS.generations)]
      .map((id) => memory.read(COLLECTIONS.generations, id))
      .find((item) => (item?.parameters as { purpose?: string } | undefined)?.purpose === 'voice_change');
    assert.equal((voiceGeneration?.parameters as { job?: string }).job, 'sing_over');

    const funnel = funnelMemory();
    setFunnelStoreForTests(funnel.store);
    await keepVoiceChange({ songId: 'song-1', uid: 'owner-1', versionId: null, platform: 'web' });
    const keptProps = funnel.docs[0].data.props as { source: string; split: boolean };
    assert.equal(keptProps.source, 'split');
    assert.equal(keptProps.split, true);
    assert.equal((memory.read(COLLECTIONS.songs, 'song-1')?.voiceChange as { used: number }).used, 1);

    const again = await startVoiceChange({
      songId: 'song-1',
      uid: 'owner-1',
      voice: 'harbor',
      platform: 'web',
    });
    assert.equal(again.used, 2);
    assert.deepEqual(splits, [MIX_URL]);
    assert.equal(sings.length, 2);
    assert.equal(sings[1], cached.audioUrl);
    await keepVoiceChange({ songId: 'song-1', uid: 'owner-1', versionId: null, platform: 'web' });

    await assert.rejects(
      () => startVoiceChange({ songId: 'song-1', uid: 'owner-1', voice: 'vesper', platform: 'web' }),
      (error: unknown) => error instanceof HttpError && error.status === 409 && error.message === 'No voice changes left'
    );
    assert.deepEqual(splits, [MIX_URL]);
  });

  it('does not spend a change when the split fails or Sing Over never accepts', async () => {
    const memory = memoryDb();
    await seedNormal(memory, { voiceChange: { used: 1, status: null } });
    setVoiceChangeDepsForTests({
      async split() {
        throw new Error('Stem split request failed with status 422');
      },
      async submit() {
        throw new Error('should not sing');
      },
    });
    await assert.rejects(() =>
      startVoiceChange({ songId: 'song-1', uid: 'owner-1', voice: 'vesper', platform: 'web' })
    );
    const afterReject = memory.read(COLLECTIONS.songs, 'song-1')?.voiceChange as { used: number; status: string | null };
    assert.equal(afterReject.used, 1);
    assert.equal(afterReject.status, null);

    await memory.put(COLLECTIONS.songs, 'song-1', normalSong({ voiceChange: { used: 0, status: null } }));
    let splits = 0;
    setVoiceChangeDepsForTests({
      async split() {
        splits += 1;
        return {
          taskId: 'task-split',
          conversionId: 'conv-split',
          creditEstimate: 0.1,
          isFreePromo: false,
          raw: { task_id: 'task-split', credit_estimate: 0.1 },
        };
      },
      async submit() {
        throw new Error('Sing Over request failed with status 500');
      },
    });
    setSongAudioStorageDepsForTests({
      bucket: storageBucket(),
      fetchImpl: (async () => new Response('mp3', { status: 200 })) as typeof fetch,
    });
    await startVoiceChange({ songId: 'song-1', uid: 'owner-1', voice: 'vesper', platform: 'web' });
    const failedWebhook = await processMusicGptWebhook({
      success: true,
      conversion_type: 'Extraction',
      task_id: 'task-split',
      conversion_id: 'conv-split',
      audio_url: JSON.stringify({ instrumental: SPLIT_INSTRUMENTAL, vocals: 'https://cdn1.musicgpt.com/conversions/vocals.mp3' }),
      credit_estimate: 0.1,
      conversion_cost: 0.1,
    });
    assert.equal(failedWebhook.status, 200);
    const failed = memory.read(COLLECTIONS.songs, 'song-1');
    const failedVoice = failed?.voiceChange as { used: number; status: string };
    assert.equal(failedVoice.used, 0);
    assert.equal(failedVoice.status, 'failed');
    assert.equal((failed?.voiceSplit as { status: string }).status, 'ready');

    setVoiceChangeDepsForTests({
      async split() {
        splits += 1;
        throw new Error('should reuse the cached instrumental');
      },
      async submit() {
        return {
          result: {
            taskId: 'task-voice-2',
            conversionIds: ['nv-1', 'nv-2'],
            creditEstimate: 0.05,
            raw: { credit_estimate: 0.05 },
          },
          account: { attempts: 1, creditEstimate: 0.05 },
        };
      },
    });
    const retried = await startVoiceChange({
      songId: 'song-1',
      uid: 'owner-1',
      voice: 'harbor',
      platform: 'web',
    });
    assert.equal(retried.used, 1);
    assert.equal(splits, 1);

    await memory.put(COLLECTIONS.songs, 'song-1', normalSong());
    setVoiceChangeDepsForTests({
      async split() {
        return {
          taskId: 'task-split-2',
          conversionId: 'conv-split-2',
          creditEstimate: 0,
          isFreePromo: true,
          raw: { credit_estimate: 0 },
        };
      },
      async submit() {
        throw new Error('should not sing');
      },
    });
    await startVoiceChange({ songId: 'song-1', uid: 'owner-1', voice: 'vesper', platform: 'web' });
    await noteVoiceSplitFailed('song-1', 'missing');
    const splitFailed = memory.read(COLLECTIONS.songs, 'song-1')?.voiceChange as { used: number; status: string };
    assert.equal(splitFailed.used, 0);
    assert.equal(splitFailed.status, 'failed');
  });

  it('refuses a normal song that already used both changes, on the same counter as beat-first', async () => {
    const memory = memoryDb();
    await seedNormal(memory, { voiceChange: { used: 2, status: null } });
    let splits = 0;
    setVoiceChangeDepsForTests({
      async split() {
        splits += 1;
        throw new Error('should not split');
      },
      async submit() {
        throw new Error('should not sing');
      },
    });
    await assert.rejects(
      () => startVoiceChange({ songId: 'song-1', uid: 'owner-1', voice: 'vesper', platform: 'web' }),
      (error: unknown) => error instanceof HttpError && error.message === 'No voice changes left'
    );
    assert.equal(splits, 0);
  });
});
