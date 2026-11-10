import './render-setup';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/generations/musicgpt/route';
import {
  buildMusicGPTStyleFromArtistContext,
  buildMusicGptCreateBody,
  MUSICGPT_DEFAULT_MODEL,
} from '../lib/ai/providers/musicgpt';
import {
  appendCreateStyleHints,
  artistDefaults,
  customizeChanged,
  defaultFeel,
  defaultsSummary,
  energyFromTempo,
  initialSongCustomize,
  parseCreateOptions,
  previewSentence,
  resolveCreateRequest,
  styleInputFromArtistContext,
  toggleFeel,
  type ArtistDefaults,
  type SongCustomizeValue,
} from '../lib/create/songOptions';
import { setMusicGptGenerationDepsForTests } from '../lib/server/musicgptGeneration';
import { setFunnelStoreForTests, type FunnelStore } from '../lib/server/funnel';
import type { SongDocument } from '../types/firestore';

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
  setMusicGptGenerationDepsForTests(null);
  setFunnelStoreForTests(null);
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const dna = {
  styleDNA: {
    genres: ['pop'],
    moods: ['Chill', 'Dreamy', 'Dark'],
    tempoRange: { min: 96, max: 110 },
    influences: ['Sade'],
  },
  lore: 'An instrumental night drive with a soft chorus.',
  vocalIdentity: 'warm alto',
};

describe('music style composition', () => {
  it('keeps DNA and appends feel, then energy', () => {
    const base = buildMusicGPTStyleFromArtistContext(dna);
    assert.equal(base.make_instrumental, false);
    assert.match(base.music_style || '', /warm alto/);
    assert.match(base.music_style || '', /instrumental night drive/);
    const style = appendCreateStyleHints(base.music_style, {
      feel: ['Chill', 'Dreamy'],
      energy: 'Fast',
    });
    assert.ok(style);
    assert.ok(style.includes('warm alto'));
    assert.ok(style.indexOf('warm alto') < style.indexOf('Chill, Dreamy'));
    assert.ok(style.indexOf('Chill, Dreamy') < style.indexOf('Fast'));
    assert.equal(style.endsWith('Fast'), true);
  });

  it('does not turn on instrumental because lore says instrumental', () => {
    const base = buildMusicGPTStyleFromArtistContext(dna);
    const resolved = resolveCreateRequest({
      musicStyle: base.music_style,
      options: null,
      lyrics: 'la la',
      defaults: artistDefaults(styleInputFromArtistContext(dna)),
    });
    assert.equal(resolved.make_instrumental, false);
    assert.equal(resolved.gender, undefined);
    assert.equal(resolved.lyrics, 'la la');
    assert.equal(resolved.persisted, null);
    assert.deepEqual(resolved.used, []);
    assert.equal(resolved.music_style, base.music_style);
  });

  it('lets only the switch set instrumental and drops voice and lyrics', () => {
    const base = buildMusicGPTStyleFromArtistContext(dna);
    const resolved = resolveCreateRequest({
      musicStyle: base.music_style,
      options: {
        instrumental: true,
        voice: 'female',
        feel: ['Angry'],
        energy: 'Fast',
      },
      lyrics: 'my words',
      defaults: artistDefaults(styleInputFromArtistContext(dna)),
    });
    assert.equal(resolved.make_instrumental, true);
    assert.equal(resolved.gender, undefined);
    assert.equal(resolved.lyrics, undefined);
    assert.equal(resolved.persisted?.voice, 'same');
    assert.equal(resolved.persisted?.words, 'artist');
    assert.equal('tone' in (resolved.persisted ?? {}), false);
    assert.match(resolved.music_style || '', /Angry/);
    assert.match(resolved.music_style || '', /Fast/);
    assert.deepEqual(resolved.used, ['instrumental', 'feel', 'energy']);
  });

  it('maps her voice and his voice to gender and omits it for the artist voice', () => {
    const defaults = artistDefaults(styleInputFromArtistContext(dna));
    const female = resolveCreateRequest({
      musicStyle: 'pop',
      options: { instrumental: false, voice: 'female', feel: null, energy: null },
      defaults,
    });
    const male = resolveCreateRequest({
      musicStyle: 'pop',
      options: { instrumental: false, voice: 'male', feel: null, energy: null },
      defaults,
    });
    const same = resolveCreateRequest({
      musicStyle: 'pop',
      options: { instrumental: false, voice: 'same', feel: null, energy: null },
      defaults,
    });
    assert.equal(female.gender, 'female');
    assert.equal(male.gender, 'male');
    assert.equal(same.gender, undefined);
    assert.deepEqual(female.used, ['voice']);
    assert.deepEqual(same.used, []);

    const v1 = buildMusicGptCreateBody(
      { prompt: 'a song', gender: 'female', make_instrumental: false },
      { version: 'v1' }
    );
    assert.equal(v1.gender, 'female');
    assert.equal('model' in v1, false);
    assert.equal('lyrics_timestamps' in v1, false);
    assert.equal('voice_id' in v1, false);

    const v2 = buildMusicGptCreateBody(
      { prompt: 'a song', gender: 'male', make_instrumental: true },
      { version: 'v2' }
    );
    assert.equal(v2.gender, 'male');
    assert.equal(v2.make_instrumental, true);
    assert.equal(v2.model, MUSICGPT_DEFAULT_MODEL);
    assert.equal('voice_id' in v2, false);

    const omitted = buildMusicGptCreateBody({ prompt: 'a song' }, { version: 'v1' });
    assert.equal('gender' in omitted, false);
    assert.equal(omitted.make_instrumental, false);
  });

  it('appends only feel and energy that differ from the artist', () => {
    const defaults = artistDefaults(styleInputFromArtistContext(dna));
    assert.deepEqual(defaults.feel, ['Chill', 'Dreamy']);
    assert.equal(defaults.energy, 'Steady');
    const same = resolveCreateRequest({
      musicStyle: 'warm alto. pop',
      options: {
        instrumental: false,
        voice: 'same',
        feel: ['Dreamy', 'Chill'],
        energy: 'Steady',
      },
      defaults,
    });
    assert.equal(same.music_style, 'warm alto. pop');
    assert.deepEqual(same.used, []);

    const changed = resolveCreateRequest({
      musicStyle: 'warm alto. pop',
      options: {
        instrumental: false,
        voice: 'same',
        feel: ['Happy'],
        energy: 'Slow',
      },
      lyrics: '  [Chorus]\nStay  ',
      defaults,
    });
    assert.equal(changed.music_style, 'warm alto. pop. Happy. Slow');
    assert.equal(changed.lyrics, '[Chorus]\nStay');
    assert.deepEqual(changed.used, ['lyrics', 'feel', 'energy']);
    assert.equal(changed.persisted?.words, 'mine');
  });

  it('strips gender words when His is picked and leaves them for the artist voice', () => {
    const style = 'warm female vocals. pop. mood: chill';
    const defaults: ArtistDefaults = { feel: [], energy: 'Steady' };
    const his = resolveCreateRequest({
      musicStyle: style,
      options: { instrumental: false, voice: 'male', feel: null, energy: null },
      defaults,
    });
    assert.equal(his.gender, 'male');
    assert.equal(his.music_style, 'warm. pop. mood: chill');
    assert.equal(/\bfemale\b/i.test(his.music_style || ''), false);
    assert.equal(/\bvocals\b/i.test(his.music_style || ''), false);

    const hers = resolveCreateRequest({
      musicStyle: 'her bright girl vocal',
      options: { instrumental: false, voice: 'female', feel: null, energy: null },
      defaults,
    });
    assert.equal(hers.gender, 'female');
    assert.equal(hers.music_style, 'bright vocal');

    const same = resolveCreateRequest({
      musicStyle: style,
      options: { instrumental: false, voice: 'same', feel: null, energy: null },
      defaults,
    });
    assert.equal(same.gender, undefined);
    assert.equal(same.music_style, style);
  });

  it('replaces a BPM phrase with Fast and leaves it when energy is not picked', () => {
    const style = 'pop. 70-90 BPM. night drive';
    const defaults: ArtistDefaults = { feel: [], energy: 'Slow' };
    const fast = resolveCreateRequest({
      musicStyle: style,
      options: { instrumental: false, voice: 'same', feel: null, energy: 'Fast' },
      defaults,
    });
    assert.equal(fast.music_style, 'pop. Fast. night drive');
    assert.equal(/bpm/i.test(fast.music_style || ''), false);
    assert.deepEqual(fast.used, ['energy']);

    const also = resolveCreateRequest({
      musicStyle: '120 bpm uptempo. slow tempo verse',
      options: { instrumental: false, voice: 'same', feel: ['Hype'], energy: 'Fast' },
      defaults,
    });
    assert.equal(also.music_style, 'Fast. verse. Hype');
    assert.equal(/bpm|uptempo|slow tempo/i.test(also.music_style || ''), false);

    const untouched = resolveCreateRequest({
      musicStyle: style,
      options: { instrumental: false, voice: 'same', feel: null, energy: null },
      defaults,
    });
    assert.equal(untouched.music_style, style);
    assert.deepEqual(untouched.used, []);
  });

  it('derives energy from the BPM range without putting numbers in the hint', () => {
    assert.equal(energyFromTempo(60, 80), 'Slow');
    assert.equal(energyFromTempo(60, 180), 'Steady');
    assert.equal(energyFromTempo(140, 160), 'Fast');
    assert.equal(energyFromTempo(undefined, undefined), 'Steady');
    assert.deepEqual(defaultFeel(['late-night', 'chill', 'CHILL', 'sad', 'hype']), ['Chill', 'Sad']);
  });
});

function memoryFunnel() {
  const rows: Record<string, unknown>[] = [];
  const store: FunnelStore = {
    async create(_id, data) {
      rows.push(data);
    },
    async add(data) {
      rows.push(data);
    },
  };
  return { store, rows };
}

function ownedSong(): SongDocument {
  const now = Timestamp.fromMillis(Date.now());
  return {
    id: 'song-1',
    ownerId: 'alice',
    artistId: 'artist-1',
    artistVersionId: 'av-1',
    title: 'Night Bus',
    isPublic: false,
    createdAt: now as unknown as SongDocument['createdAt'],
    updatedAt: now as unknown as SongDocument['updatedAt'],
    deletedAt: null,
    currentVersionId: 'ver-1',
    parentSongId: null,
    collaborationType: null,
    albumCoverPath: null,
    albumCoverThumbnail: null,
  };
}

describe('POST /api/generations/musicgpt create options', { concurrency: false }, () => {
  it('keeps a mobile request on DNA with instrumental off when options are omitted', async () => {
    setEnv('WEBHOOK_BASE_URL', 'https://configured.example');
    setEnv('MUSICGPT_WEBHOOK_SECRET', 'webhook-secret');
    setEnv('MUSICGPT_API_VERSION', 'v1');
    const seen: Array<Record<string, unknown>> = [];
    setMusicGptGenerationDepsForTests({
      verifyToken: async () => ({ uid: 'alice' }),
      createMusic: async input => {
        seen.push({ ...input });
        return { task_id: 'task-mobile', conversion_id_1: 'c1' };
      },
      saveTaskBinding: async () => {},
    });

    const response = await POST(
      new NextRequest('https://configured.example/api/generations/musicgpt', {
        method: 'POST',
        headers: { authorization: 'Bearer good', 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: 'a night drive',
          lyrics: 'la',
          artistContext: dna,
        }),
      })
    );
    assert.equal(response.status, 200);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].make_instrumental, false);
    assert.equal('gender' in seen[0], false);
    assert.equal(seen[0].lyrics, 'la');
    assert.match(String(seen[0].music_style), /instrumental night drive/);
    assert.equal(String(seen[0].music_style).includes('Fast'), false);
  });

  it('saves createOptions and records which options were used', async () => {
    setEnv('WEBHOOK_BASE_URL', 'https://configured.example');
    setEnv('MUSICGPT_WEBHOOK_SECRET', 'webhook-secret');
    setEnv('MUSICGPT_API_VERSION', 'v2');
    const funnel = memoryFunnel();
    setFunnelStoreForTests(funnel.store);
    const seen: Array<Record<string, unknown>> = [];
    const saved: Array<{ songId: string; options: unknown }> = [];
    setMusicGptGenerationDepsForTests({
      verifyToken: async () => ({ uid: 'alice' }),
      getSong: async () => ownedSong(),
      gateRetry: async () => 'resubmit',
      createMusic: async input => {
        seen.push({ ...input });
        return { task_id: 'task-web', conversion_id_1: 'c1', conversion_id_2: 'c2' };
      },
      saveTaskBinding: async () => {},
      saveCreateOptions: async (songId, options) => {
        saved.push({ songId, options });
      },
    });

    const response = await POST(
      new NextRequest('https://configured.example/api/generations/musicgpt', {
        method: 'POST',
        headers: {
          authorization: 'Bearer good',
          'content-type': 'application/json',
          'x-streamstar-platform': 'web',
        },
        body: JSON.stringify({
          prompt: 'a night drive',
          lyrics: 'sing this',
          songId: 'song-1',
          artistId: undefined,
          artistContext: dna,
          createOptions: {
            instrumental: false,
            voice: 'female',
            tone: 'Soft',
            feel: ['Happy'],
            energy: 'Fast',
          },
        }),
      })
    );
    assert.equal(response.status, 200);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(seen[0].gender, 'female');
    assert.equal(seen[0].make_instrumental, false);
    assert.equal(seen[0].lyrics, 'sing this');
    assert.match(String(seen[0].music_style), /\. Fast\./);
    assert.match(String(seen[0].music_style), /Happy$/);
    assert.equal(/\d+\s*-\s*\d+\s*bpm/i.test(String(seen[0].music_style)), false);
    assert.equal(String(seen[0].music_style).includes('Soft'), false);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].songId, 'song-1');
    assert.equal((saved[0].options as { voice: string }).voice, 'female');
    assert.equal('tone' in (saved[0].options as object), false);
    const used = funnel.rows.filter(row => row.event === 'create_options_used');
    assert.equal(used.length, 1);
    assert.equal((used[0].props as { options: string }).options, 'voice,lyrics,feel,energy');
    assert.equal(parseCreateOptions(null), null);
  });
});

describe('preview copy', () => {
  it('describes only the picks and names the reset link after a change', () => {
    const defaults = artistDefaults({ name: 'Nova', moods: ['Chill'], tempoMin: 96, tempoMax: 110 });
    const value: SongCustomizeValue = {
      ...initialSongCustomize(defaults),
      feel: ['Chill'],
      energy: 'Fast',
      words: 'mine',
      lyrics: 'stay',
    };
    assert.equal(
      previewSentence({ artistName: 'Nova', value }),
      'Nova will make a chill, fast song, singing your words.'
    );
    assert.equal(customizeChanged(value, defaults), true);
    assert.equal(defaultsSummary('Nova', defaults), "Nova's voice · Nova writes the words · Chill, Steady");
    assert.equal(/soft|raspy|airy|powerful|smooth|how they sing/i.test(defaultsSummary('Nova', defaults)), false);
    assert.equal(
      /soft|raspy|airy|powerful|smooth|how they sing/i.test(
        previewSentence({ artistName: 'Nova', value })
      ),
      false
    );
    const untouched = initialSongCustomize(defaults);
    assert.equal(customizeChanged(untouched, defaults), false);
    assert.equal(
      previewSentence({ artistName: 'Nova', value: untouched }),
      'Nova will make a chill, steady song.'
    );
  });

  it('swaps out the oldest feel when a third chip is tapped', () => {
    assert.deepEqual(toggleFeel(['Hype', 'Chill'], 'Sad'), ['Chill', 'Sad']);
    assert.deepEqual(toggleFeel(['Chill', 'Sad'], 'Chill'), ['Sad']);
    assert.deepEqual(toggleFeel(['Chill'], 'Sad'), ['Chill', 'Sad']);
  });
});
