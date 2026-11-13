import './render-setup';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { GET as getVoices } from '../app/api/voices/route';
import { POST } from '../app/api/generations/musicgpt/route';
import { ArtistPickList } from '../components/create/ArtistPickList';
import { VoicePicker, beginVoicePreview, nextPreviewSlug } from '../components/voices/VoicePicker';
import { buildMusicGptCreateBody, MUSICGPT_DEFAULT_MODEL } from '../lib/ai/providers/musicgpt';
import { singOverTextFields } from '../lib/server/singOver';
import { isClientFunnelEvent, isFunnelEvent, sanitizeFunnelProps } from '../lib/server/funnel';
import { setMusicGptGenerationDepsForTests } from '../lib/server/musicgptGeneration';
import {
  STREAMSTAR_VOICES,
  VOICE_FEATURE_CREDIT,
  VOICE_PREVIEW_LINE,
  VOICE_SLUGS,
  copySaysSoundsLike,
  isVoiceSlug,
  prependLockedPrompt,
  publicStreamstarVoices,
  voicedRequest,
} from '../lib/voices/streamstarVoices';

const ROOT = path.resolve(__dirname, '..');
const TABLE: Array<[string, string, string, string, string]> = [
  ['calla', 'Calla', 'female', 'Bright and clear', 'bright, clear female pop vocal, clean tone, light airy top notes'],
  ['vesper', 'Vesper', 'female', 'Low and smoky', 'low, smoky female vocal, warm chest tone, slow intimate delivery'],
  ['sable', 'Sable', 'female', 'Dark and soulful', 'rich soulful female vocal, dark warm tone, controlled runs'],
  ['wren', 'Wren', 'female', 'Soft and breathy', 'soft breathy female vocal, gentle close-mic delivery, delicate'],
  ['briar', 'Briar', 'female', 'Raw and gritty', 'raspy gritty female vocal, raw edge, punchy rock delivery'],
  ['harbor', 'Harbor', 'male', 'Warm and steady', 'warm steady male baritone, smooth and grounded'],
  ['wells', 'Wells', 'male', 'High and sweet', 'high sweet male tenor, light falsetto, smooth R&B phrasing'],
  ['flint', 'Flint', 'male', 'Sharp and fast', 'sharp crisp male vocal, rhythmic rap-sung flow, tight delivery'],
  ['slate', 'Slate', 'male', 'Deep and calm', 'deep calm male bass-baritone, slow rich resonant tone'],
  ['keel', 'Keel', 'male', 'Rough and loud', 'rough powerful male vocal, gritty belt, big anthemic delivery'],
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'tests') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('curated Streamstar voices', () => {
  afterEach(() => {
    setMusicGptGenerationDepsForTests(null);
  });

  it('is the design table and nothing from a MusicGPT library', () => {
    assert.deepEqual(
      STREAMSTAR_VOICES.map(voice => [voice.slug, voice.name, voice.gender, voice.descriptor, voice.lockedPrompt]),
      TABLE
    );
    assert.deepEqual(STREAMSTAR_VOICES.map(voice => voice.slug), [...VOICE_SLUGS]);
    for (const voice of STREAMSTAR_VOICES) {
      assert.equal(copySaysSoundsLike(voice.name), false);
      assert.equal(copySaysSoundsLike(voice.descriptor), false);
      assert.equal(copySaysSoundsLike(voice.lockedPrompt), false);
      assert.equal(voice.descriptor.includes('Bright and airy'), false);
    }
    const source = readFileSync(path.join(ROOT, 'lib/voices/streamstarVoices.ts'), 'utf8');
    assert.equal(source.includes('getAllVoices'), false);
    assert.equal(source.includes('searchVoices'), false);
    assert.equal(source.includes('voice_id'), false);
    const generation = readFileSync(path.join(ROOT, 'lib/server/musicgptGeneration.ts'), 'utf8');
    assert.equal(generation.includes('getAllVoices'), false);
    assert.equal(generation.includes('searchVoices'), false);
    assert.equal(generation.includes('voice_id'), false);
    const sing = readFileSync(path.join(ROOT, 'lib/server/voiceChange.ts'), 'utf8');
    assert.equal(sing.includes('getAllVoices'), false);
    assert.equal(sing.includes('voice_id'), false);
    assert.equal(VOICE_FEATURE_CREDIT, 0);
    assert.equal(VOICE_PREVIEW_LINE, 'Hold the note and let it fall.');
    assert.equal(isVoiceSlug('gpt-voice-1'), false);
  });

  it('prepends the locked prompt on MusicAI and Sing Over and does not replace the rest', () => {
    const lock = 'bright, clear female pop vocal, clean tone, light airy top notes';
    const song = prependLockedPrompt('a night drive', lock);
    assert.equal(song, `${lock}\na night drive`);
    assert.equal(prependLockedPrompt(song, lock), song);
    assert.throws(() => prependLockedPrompt('a night drive', ' '), /Locked prompt is missing/);
    const body = buildMusicGptCreateBody(
      {
        prompt: song,
        music_style: 'warm alto. pop',
        gender: 'female',
        make_instrumental: false,
      },
      { version: 'v2' }
    );
    assert.equal(body.model, MUSICGPT_DEFAULT_MODEL);
    assert.equal(body.model, 'v6');
    assert.equal(body.prompt, song);
    assert.equal(body.music_style, 'warm alto. pop');
    assert.equal(body.gender, 'female');
    assert.equal('voice_id' in body, false);
    const singFields = singOverTextFields({
      prompt: prependLockedPrompt('warm alto. Chill. a night drive', lock),
      lyrics: '[Verse]\nhi',
      voice: 'female',
    });
    assert.ok(String(singFields.prompt).startsWith(lock));
    assert.match(String(singFields.prompt), /a night drive/);
    assert.notEqual(singFields.prompt, lock);
    assert.equal(singFields.gender, 'female');
    const voiced = voicedRequest({ prompt: 'a night drive', slug: 'calla' });
    assert.equal(voiced.gender, 'female');
    assert.equal(voiced.prompt, `${lock}\na night drive`);
    const harbor = voicedRequest({ prompt: 'same beat', slug: 'harbor' });
    assert.equal(harbor.gender, 'male');
    assert.match(harbor.prompt, /warm steady male baritone, smooth and grounded\nsame beat/);
  });

  it('uses the artist voice on song create and ignores a client her/his override', async () => {
    process.env.WEBHOOK_BASE_URL = 'https://configured.example';
    process.env.MUSICGPT_WEBHOOK_SECRET = 'webhook-secret';
    const seen: Array<Record<string, unknown>> = [];
    const saved: string[] = [];
    setMusicGptGenerationDepsForTests({
      verifyToken: async () => ({ uid: 'alice' }),
      getArtist: async () =>
        ({
          id: 'artist-1',
          ownerId: 'alice',
          voiceSlug: 'calla',
          deletedAt: null,
        }) as never,
      getSong: async () =>
        ({
          id: 'song-1',
          ownerId: 'alice',
          deletedAt: null,
          audioReady: false,
          generationStatus: null,
          createdAt: { toMillis: () => Date.now() },
        }) as never,
      gateRetry: async () => 'resubmit',
      createMusic: async input => {
        seen.push({ ...input });
        return { task_id: 'task-voice', conversion_id_1: 'c1' };
      },
      saveTaskBinding: async () => {},
      saveCreateOptions: async (_songId, options) => {
        saved.push(options.voice);
      },
      saveVoiceSlug: async (_songId, slug) => {
        saved.push(slug);
      },
    });
    const response = await POST(
      new NextRequest('https://configured.example/api/generations/musicgpt', {
        method: 'POST',
        headers: { authorization: 'Bearer good', 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: 'a night drive',
          lyrics: 'la',
          artistId: 'artist-1',
          songId: 'song-1',
          createOptions: { instrumental: false, voice: 'male', feel: null, energy: null },
        }),
      })
    );
    assert.equal(response.status, 200);
    assert.equal(seen[0].gender, 'female');
    assert.equal(
      seen[0].prompt,
      'bright, clear female pop vocal, clean tone, light airy top notes\na night drive'
    );
    assert.equal(seen[0].make_instrumental, false);
    assert.deepEqual(saved, ['same', 'calla']);
    assert.equal(VOICE_FEATURE_CREDIT, 0);
  });

  it('keeps an instrumental song free of the locked prompt', async () => {
    process.env.WEBHOOK_BASE_URL = 'https://configured.example';
    process.env.MUSICGPT_WEBHOOK_SECRET = 'webhook-secret';
    const seen: Array<Record<string, unknown>> = [];
    setMusicGptGenerationDepsForTests({
      verifyToken: async () => ({ uid: 'alice' }),
      getArtist: async () =>
        ({ id: 'artist-1', ownerId: 'alice', voiceSlug: 'calla', deletedAt: null }) as never,
      createMusic: async input => {
        seen.push({ ...input });
        return { task_id: 'task-beat' };
      },
      saveTaskBinding: async () => {},
    });
    const response = await POST(
      new NextRequest('https://configured.example/api/generations/musicgpt', {
        method: 'POST',
        headers: { authorization: 'Bearer good', 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: 'just the beat',
          artistId: 'artist-1',
          createOptions: { instrumental: true, voice: 'female' },
        }),
      })
    );
    assert.equal(response.status, 200);
    assert.equal(seen[0].make_instrumental, true);
    assert.equal(seen[0].prompt, 'just the beat');
    assert.equal('gender' in seen[0], false);
  });

  it('keeps artist_picked and voice_picked server-only and stores our slug', () => {
    assert.equal(isFunnelEvent('voice_picked'), true);
    assert.equal(isFunnelEvent('artist_picked'), true);
    assert.equal(isClientFunnelEvent('voice_picked'), false);
    assert.equal(isClientFunnelEvent('artist_picked'), false);
    assert.equal(sanitizeFunnelProps({ voice: 'calla', artistId: 'artist-1' }).voice, 'calla');
    assert.equal('voice' in sanitizeFunnelProps({ voice: 'gpt_voice_99' }), false);
    assert.equal('lockedPrompt' in sanitizeFunnelProps({ lockedPrompt: 'secret', voice: 'keel' }), false);
    for (const slug of VOICE_SLUGS) {
      assert.equal(sanitizeFunnelProps({ voice: slug }).voice, slug);
    }
  });

  it('serves name and descriptor without the locked prompt', async () => {
    const response = getVoices();
    const body = (await response.json()) as { voices: Array<Record<string, string>> };
    assert.equal(body.voices.length, 10);
    assert.equal(body.voices[0].slug, 'calla');
    assert.equal(body.voices[0].name, 'Calla');
    assert.equal(body.voices[0].descriptor, 'Bright and clear');
    assert.equal(body.voices[0].previewUrl, '/voices/calla.mp3');
    assert.equal('lockedPrompt' in body.voices[0], false);
    const json = JSON.stringify(body);
    assert.equal(json.includes('light airy top notes'), false);
    assert.equal(json.includes('slow intimate delivery'), false);
    assert.equal(json.includes('sounds like'), false);
    assert.equal(publicStreamstarVoices().every(voice => !('lockedPrompt' in voice)), true);
  });

  it('renders picker rows with the ice button disabled until a voice is selected', () => {
    const voices = publicStreamstarVoices();
    const idle = renderToStaticMarkup(
      createElement(VoicePicker, {
        voices,
        selected: null,
        onSelect: () => {},
        onUse: () => {},
      })
    );
    assert.match(idle, /This is how they sing\./);
    assert.equal(idle.includes('Use this voice'), false);
    assert.equal(idle.includes('Pick a voice first'), false);
    assert.match(idle, /h-11 w-11/);
    assert.match(idle, /rounded-full bg-\[#1C1C28\]/);
    assert.match(idle, /items-center justify-center/);
    assert.match(idle, /data-counts-as-play="false"/);
    assert.match(idle, /Bright and clear/);
    assert.match(idle, /Low and smoky/);
    assert.match(idle, /Rough and loud/);
    assert.match(idle, /rounded-\[12px\]/);
    assert.match(idle, /data-preview="calla"/);
    assert.equal(idle.includes('autoplay'), false);
    assert.equal(idle.includes('autoPlay'), false);
    assert.equal(idle.includes('#C8F542'), false);
    assert.equal(idle.includes('sounds like'), false);
    assert.equal(idle.includes('grid-cols'), false);
    assert.equal(idle.includes('Bright and airy'), false);
    assert.equal(idle.includes('data-use-voice'), false);
    let pauses = 0;
    assert.equal(
      beginVoicePreview({
        playing: null,
        clicked: 'calla',
        pausePlayer: () => {
          pauses += 1;
        },
      }),
      'calla'
    );
    assert.equal(pauses, 1);
    assert.equal(
      beginVoicePreview({
        playing: 'calla',
        clicked: 'calla',
        pausePlayer: () => {
          pauses += 1;
        },
      }),
      null
    );
    assert.equal(pauses, 1);
    const pickerSource = readFileSync(path.join(ROOT, 'components/voices/VoicePicker.tsx'), 'utf8');
    assert.match(pickerSource, /pausePlayerAudio/);
    assert.match(readFileSync(path.join(ROOT, 'lib/player/boundAudio.ts'), 'utf8'), /boundPause/);
    assert.match(readFileSync(path.join(ROOT, 'components/songs/SongPlayerProvider.tsx'), 'utf8'), /bindPlayerPause/);
    assert.equal(pickerSource.includes('trackPlay'), false);
    assert.equal(pickerSource.includes('reportClientFunnelEvent'), false);
    assert.equal(nextPreviewSlug(null, 'calla'), 'calla');
    assert.equal(nextPreviewSlug('calla', 'calla'), null);
    assert.equal(nextPreviewSlug('calla', 'harbor'), 'harbor');

    const picked = renderToStaticMarkup(
      createElement(VoicePicker, {
        voices,
        selected: 'calla',
        onSelect: () => {},
        onUse: () => {},
      })
    );
    assert.match(picked, /data-selected="true"/);
    assert.match(picked, /background:\s*#2A2A38|#2A2A38/);
    const row = picked.slice(picked.indexOf('data-voice-row="calla"'), picked.indexOf('data-voice-row="vesper"'));
    assert.match(row, /border-transparent|border:\s*none|border-color:\s*transparent/);
    assert.equal(row.includes('border-[#2A2A38]'), false);
    assert.equal(picked.includes('Use this voice'), false);
    const confirmed = renderToStaticMarkup(
      createElement(VoicePicker, {
        voices,
        selected: null,
        confirm: true,
        currentSlug: 'harbor',
        onSelect: () => {},
        onUse: () => {},
      })
    );
    assert.match(confirmed, /Use this voice/);
    const useTag = confirmed.match(/<button[^>]*data-use-voice[^>]*>/)?.[0] ?? '';
    assert.match(useTag, /disabled=""/);
    const currentRow = confirmed.slice(
      confirmed.indexOf('data-voice-row="harbor"'),
      confirmed.indexOf('data-voice-row="wells"')
    );
    assert.match(currentRow, />Current</);
    assert.match(currentRow, /#8B8896/);
    assert.equal(currentRow.includes('opacity-40'), false);
    const chosen = renderToStaticMarkup(
      createElement(VoicePicker, {
        voices,
        selected: 'calla',
        confirm: true,
        currentSlug: 'harbor',
        onSelect: () => {},
        onUse: () => {},
      })
    );
    const chosenUse = chosen.match(/<button[^>]*data-use-voice[^>]*>/)?.[0] ?? '';
    assert.equal(chosenUse.includes('disabled=""'), false);

    const artists = renderToStaticMarkup(
      createElement(ArtistPickList, {
        artists: [
          { id: 'a1', name: 'Nova', avatarURL: null },
          { id: 'a2', name: 'Lux', avatarURL: 'https://cdn.example/lux.jpg' },
        ],
        selectedId: 'a1',
        onSelect: () => {},
      })
    );
    assert.match(artists, /data-artist-picker/);
    assert.match(artists, />Nova</);
    assert.match(artists, /aria-selected="true"/);
    assert.equal(artists.includes('<select'), false);
    assert.equal(artists.includes('#C8F542'), false);
  });

  it('does not let client components import the voice module', () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const source = readFileSync(file, 'utf8');
      if (!source.includes("'use client'") && !source.includes('"use client"')) continue;
      const valueImport = source.split('\n').some(line => {
        if (!line.includes('lib/voices/streamstarVoices')) return false;
        const trimmed = line.trim();
        return !trimmed.startsWith('import type') && !trimmed.includes('import type {');
      });
      if (valueImport) offenders.push(path.relative(ROOT, file));
    }
    assert.deepEqual(offenders, []);
  });
});
