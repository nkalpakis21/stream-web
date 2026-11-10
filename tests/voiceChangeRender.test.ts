import './render-setup';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChangeVoiceSheet } from '../components/songs/ChangeVoiceSheet';
import { VoiceCompare } from '../components/songs/VoiceCompare';
import { buildVoiceCompareRows } from '../lib/songs/voiceChange';

describe('change the voice render', () => {
  it('offers the other voice as one Ice button, and both voices as equal ghost buttons', () => {
    const known = renderToStaticMarkup(
      createElement(ChangeVoiceSheet, {
        voices: ['male'],
        onClose: () => {},
        onSubmit: () => {},
      })
    );
    assert.match(known, /Change the voice/);
    assert.match(known, /Same beat and words, sung fresh in a new voice\./);
    assert.equal(known.includes('You may hear a little of the old vocal.'), false);
    assert.equal(known.includes('data-voice-split-caveat'), false);
    assert.match(known, /data-voice-buttons="one"/);
    assert.match(known, /Sing it in his voice/);
    assert.equal(known.includes('Sing it in her voice'), false);
    assert.equal(known.includes('Same as'), false);
    assert.match(known, /bg-\[#E8E6F2\]/);
    assert.match(known, /text-\[#0A0A10\]/);
    assert.equal(known.includes('data-part="voice"'), false);
    assert.doesNotMatch(known, /animate-spin|spinner/i);

    const unknown = renderToStaticMarkup(
      createElement(ChangeVoiceSheet, {
        voices: ['female', 'male'],
        onClose: () => {},
        onSubmit: () => {},
      })
    );
    assert.match(unknown, /data-voice-buttons="both"/);
    assert.match(unknown, /grid-cols-2/);
    assert.match(unknown, /Sing it in her voice/);
    assert.match(unknown, /Sing it in his voice/);
    assert.match(unknown, /border-\[#2A2A38\]/);
    assert.match(unknown, /text-\[#F5F4F8\]/);
    assert.equal(unknown.includes('bg-[#E8E6F2]'), false);
    assert.equal(unknown.includes('aria-pressed'), false);

    const making = renderToStaticMarkup(
      createElement(ChangeVoiceSheet, {
        voices: ['male'],
        busy: true,
        onClose: () => {},
        onSubmit: () => {},
      })
    );
    assert.match(making, /Changing the voice… about 4 min/);
    assert.match(making, /#8B8896/);
    assert.doesNotMatch(making, /animate-spin|spinner/i);
    assert.equal(making.includes('Sing it in his voice'), false);

    const split = renderToStaticMarkup(
      createElement(ChangeVoiceSheet, {
        voices: ['male'],
        splitCaveat: true,
        onClose: () => {},
        onSubmit: () => {},
      })
    );
    const subtitleAt = split.indexOf('Same beat and words, sung fresh in a new voice.');
    const caveatAt = split.indexOf('You may hear a little of the old vocal.');
    assert.ok(subtitleAt >= 0);
    assert.ok(caveatAt > subtitleAt);
    assert.match(split, /data-voice-split-caveat/);
    assert.match(split, /text-\[#8B8896\]/);
    assert.equal(split.includes('warning'), false);
    const caveat = split.slice(caveatAt - 80, caveatAt + 80);
    assert.equal(caveat.includes('<svg'), false);
  });

  it('compares the original and two new voices with the take orb and scrubber', () => {
    const rows = buildVoiceCompareRows({
      originalVersionId: 'ver-vocal',
      originalAudioUrl: 'https://cdn.example/vocal.mp3',
      conversionIds: ['nv-1', 'nv-2'],
      failedConversionIds: [],
      versions: [
        { id: 'ver-vocal', audioURL: 'https://cdn.example/vocal.mp3', providerOutputId: 'old' },
        { id: 'ver-1', audioURL: 'https://cdn.example/one.mp3', providerOutputId: 'nv-1' },
        { id: 'ver-2', audioURL: 'https://cdn.example/two.mp3', providerOutputId: 'nv-2' },
      ],
    });
    const html = renderToStaticMarkup(
      createElement(VoiceCompare, {
        rows,
        selected: '1',
        onSelect: () => {},
        onKeep: () => {},
        onKeepOriginal: () => {},
      })
    );
    assert.match(html, /Pick your favorite voice/);
    assert.match(html, /take-title/);
    assert.match(html, /Original/);
    assert.match(html, /New voice 1/);
    assert.match(html, /New voice 2/);
    const voice1 = html.slice(html.indexOf('data-voice-row="1"'), html.indexOf('data-voice-row="2"'));
    const original = html.slice(html.indexOf('data-voice-row="original"'), html.indexOf('data-voice-row="1"'));
    assert.match(voice1, /Keep this one/);
    assert.equal(original.includes('Keep this one'), false);
    assert.match(html, /song-play-orb take-orb/);
    assert.match(html, /take-scrub/);
    assert.match(html, /data-voice-row="1"/);
    assert.match(html, /take-row is-selected/);
    assert.equal(html.includes('take-row is-current'), false);
    assert.match(html, /Keep this one/);
    assert.match(html, /data-keep-original/);
    assert.match(html, /Keep original/);
    assert.match(html, /take-use/);
    assert.doesNotMatch(html, /animate-spin|spinner/i);
    const scrub = readFileSync('components/songs/pick-your-take.css', 'utf8');
    assert.match(scrub, /\.take-row\.is-selected[\s\S]*#2a2a38/);
    assert.match(scrub, /\.take-scrub[\s\S]*height:\s*12px/);

    const keptOriginal = renderToStaticMarkup(
      createElement(VoiceCompare, {
        rows,
        selected: 'original',
        onSelect: () => {},
        onKeep: () => {},
        onKeepOriginal: () => {},
      })
    );
    assert.equal(keptOriginal.includes('Keep this one'), false);
    assert.match(keptOriginal, /data-keep-original/);
    assert.match(keptOriginal, /Keep original/);
  });
});
