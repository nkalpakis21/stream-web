import './render-setup';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HearBeatFirstLink } from '../components/create/HearBeatFirstLink';
import { SongCustomizePanel } from '../components/create/SongCustomizePanel';
import { BeatFirstView } from '../components/songs/BeatFirstView';
import { BeatReadyTag } from '../components/songs/BeatReadyTag';
import { ChangeFeelSheet } from '../components/songs/ChangeFeelSheet';
import { SongCoverStack } from '../components/songs/SongCoverStack';
import { artistDefaults, initialSongCustomize } from '../lib/create/songOptions';
import type { TakeSlot } from '../lib/songs/takes';

const defaults = artistDefaults({ name: 'Nova', moods: ['Chill'], tempoMin: 90, tempoMax: 100 });

function slots(): [TakeSlot, TakeSlot] {
  return [
    {
      take: 1,
      label: 'Take 1',
      status: 'ready',
      versionId: 'ver-1',
      audioUrl: 'https://cdn.example/beat-1.mp3',
      isCurrent: true,
    },
    {
      take: 2,
      label: 'Take 2',
      status: 'ready',
      versionId: 'ver-2',
      audioUrl: 'https://cdn.example/beat-2.mp3',
      isCurrent: false,
    },
  ];
}

describe('beat-first render', () => {
  it('places the ice link and the extra-minutes note above create, and hides it for a beat-only song', () => {
    const shown = renderToStaticMarkup(
      createElement(HearBeatFirstLink, { instrumental: false, onClick: () => {} })
    );
    assert.match(shown, /Hear the beat first/);
    assert.match(shown, /Takes a few extra minutes/);
    assert.match(shown, /min-h-11/);
    assert.match(shown, /#E8E6F2/);
    assert.doesNotMatch(shown, /#C8F542/);
    const hidden = renderToStaticMarkup(
      createElement(HearBeatFirstLink, { instrumental: true, onClick: () => {} })
    );
    assert.equal(hidden, '');
    const firstArtist = renderToStaticMarkup(
      createElement(HearBeatFirstLink, { instrumental: false, firstArtist: true, onClick: () => {} })
    );
    assert.equal(firstArtist, '');
    const createFlow = readFileSync('components/create/CreateFlowView.tsx', 'utf8');
    assert.equal(createFlow.includes('Hear the beat first'), false);
    assert.equal(createFlow.includes('HearBeatFirstLink'), false);
  });

  it('shows both beats, an ice Add vocals, a retry counter, and a ghost keep link', () => {
    const html = renderToStaticMarkup(
      createElement(BeatFirstView, {
        slots: slots(),
        retriesUsed: 0,
        making: false,
        onAddVocals: () => {},
        onRetry: () => {},
        onChangeFeel: () => {},
        onKeep: () => {},
      })
    );
    assert.match(html, /Beat 1/);
    assert.match(html, /Beat 2/);
    assert.match(html, /song-play-orb take-orb/);
    assert.match(html, /take-scrub/);
    assert.match(html, />Add vocals</);
    assert.match(html, /border-\[#2A2A38\].*Try another beat \(2 left\)|Try another beat \(2 left\)/);
    assert.match(html, /border border-\[#2A2A38\]/);
    assert.match(html, /text-\[#F5F4F8\]/);
    assert.match(html, /take-row is-selected/);
    assert.equal(html.includes('take-row is-current'), false);
    assert.match(html, /Change the feel/);
    assert.match(html, /data-beat-keep="true"/);
    assert.match(html, /Use as is, no vocals/);
    assert.match(html, /bg-\[#E8E6F2\]/);
    assert.match(html, /text-\[#0A0A10\]/);
    assert.match(html, /min-h-11/);
    assert.doesNotMatch(html, /#C8F542/);
    assert.doesNotMatch(html, /How they sing/);
    assert.doesNotMatch(html, /animate-spin/);
    const oneLeft = renderToStaticMarkup(
      createElement(BeatFirstView, {
        slots: slots(),
        retriesUsed: 1,
        making: false,
        onAddVocals: () => {},
        onRetry: () => {},
        onChangeFeel: () => {},
        onKeep: () => {},
      })
    );
    assert.match(oneLeft, /Try another beat \(1 left\)/);
    const spent = renderToStaticMarkup(
      createElement(BeatFirstView, {
        slots: slots(),
        retriesUsed: 2,
        making: false,
        onAddVocals: () => {},
        onRetry: () => {},
        onChangeFeel: () => {},
        onKeep: () => {},
      })
    );
    assert.match(spent, /No beats left/);
    assert.match(spent, /disabled/);
    assert.equal(spent.includes('Try another beat'), false);
  });

  it('puts the same orb and 12px scrubber under the cover, and a mute line while the beat is made', () => {
    const making = renderToStaticMarkup(
      createElement(BeatFirstView, {
        slots: null,
        retriesUsed: 0,
        making: true,
        onAddVocals: () => {},
        onRetry: () => {},
        onChangeFeel: () => {},
        onKeep: () => {},
      })
    );
    assert.match(making, /Making your beat…/);
    assert.match(making, /#8B8896/);
    assert.doesNotMatch(making, /animate-spin|spinner/i);
    const scrub = readFileSync('components/songs/pick-your-take.css', 'utf8');
    assert.match(scrub, /\.take-scrub[\s\S]*height:\s*12px/);
    const under = renderToStaticMarkup(
      createElement(SongCoverStack, {
        cover: createElement('div', { 'data-cover': 'true' }, 'cover'),
        below: createElement(BeatFirstView, {
          slots: slots(),
          retriesUsed: 0,
          making: false,
          onAddVocals: () => {},
          onRetry: () => {},
          onChangeFeel: () => {},
          onKeep: () => {},
        }),
      })
    );
    const coverAt = under.indexOf('data-cover');
    const rowAt = under.indexOf('song-play-orb take-orb');
    assert.ok(coverAt >= 0 && rowAt > coverAt);
    assert.match(under, /data-below-cover/);
    assert.match(under, /take-scrub/);
  });

  it('opens Feel and Energy in a sheet instead of another screen', () => {
    const html = renderToStaticMarkup(
      createElement(ChangeFeelSheet, {
        artistName: 'Nova',
        defaults,
        value: initialSongCustomize(defaults),
        onChange: () => {},
        onClose: () => {},
        retriesUsed: 1,
        onMake: () => {},
      })
    );
    assert.match(html, /data-feel-sheet/);
    assert.match(html, /role="dialog"/);
    assert.match(html, /data-part="feel-energy"/);
    assert.match(html, />Feel</);
    assert.match(html, />Energy</);
    assert.match(html, /data-feel="Chill"/);
    assert.match(html, /data-energy="Steady"/);
    assert.equal(html.includes('>Voice<'), false);
    assert.equal(html.includes('>Words<'), false);
    assert.equal(html.includes('How they sing'), false);
    assert.equal(html.includes('/dashboard'), false);
    assert.match(html, /Make a new beat \(1 left\)/);
    assert.match(html, /bg-\[#E8E6F2\]/);
    assert.doesNotMatch(html, /#C8F542/);
    const spent = renderToStaticMarkup(
      createElement(ChangeFeelSheet, {
        artistName: 'Nova',
        defaults,
        value: initialSongCustomize(defaults),
        onChange: () => {},
        onClose: () => {},
        retriesUsed: 2,
        onMake: () => {},
      })
    );
    assert.match(spent, /Make a new beat \(0 left\)/);
    assert.match(spent, /disabled/);
    const css = readFileSync('components/songs/pick-your-take.css', 'utf8');
    const panel = css.slice(css.indexOf('.take-sheet-panel'));
    const panelBlock = panel.slice(0, panel.indexOf('}'));
    assert.equal(panelBlock.includes('padding-right'), false);
    assert.match(css, /\.take-sheet-panel \.take-title\s*\{[^}]*padding-right:\s*64px/);
  });

  it('tags a ready beat on the card with a mute line and an ice Add vocals link', () => {
    const html = renderToStaticMarkup(createElement(BeatReadyTag, { songId: 'song-1' }));
    assert.match(html, /data-beat-ready/);
    assert.match(html, /text-\[#8B8896\]/);
    assert.match(html, /Beat ready ·/);
    assert.match(html, /href="\/songs\/song-1"/);
    assert.match(html, /text-\[#E8E6F2\][^>]*>Add vocals/);
    assert.equal(html.includes('private-song-tag'), false);
    assert.equal(html.includes('rounded-full'), false);
    assert.doesNotMatch(html, /#C8F542/);
  });

  it('opens voice and words without a tone row', () => {
    const html = renderToStaticMarkup(
      createElement(SongCustomizePanel, {
        artistName: 'Nova',
        artistId: 'artist-1',
        defaults,
        value: initialSongCustomize(defaults),
        onChange: () => {},
        prompt: 'a night drive',
        part: 'voice-words',
        requestDraft: async () => ({ lyrics: '', remaining: 3 }),
      })
    );
    assert.match(html, /data-part="voice-words"/);
    assert.match(html, />Voice</);
    assert.match(html, />Words</);
    assert.match(html, /data-voice-display="only"/);
    assert.match(html, /Nova(?:'|&#x27;)s voice/);
    assert.equal(html.includes('Same as Nova'), false);
    assert.equal(html.includes('Her voice'), false);
    assert.match(html, /Let Nova write it/);
    assert.equal(html.includes('>Feel<'), false);
    assert.equal(html.includes('>Energy<'), false);
    assert.equal(html.includes('How they sing'), false);
    assert.equal(html.includes('Just the beat, no vocals'), false);
    assert.doesNotMatch(html, /#C8F542/);
  });
});
