import './render-setup';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SongCreatePreview, SongCustomizePanel } from '../components/create/SongCustomizePanel';
import {
  artistDefaults,
  initialSongCustomize,
  previewSentence,
  toggleFeel,
  type FeelLabel,
  type SongCustomizeValue,
} from '../lib/create/songOptions';

const defaults = artistDefaults({
  name: 'Nova',
  moods: ['Chill', 'Happy'],
  tempoMin: 96,
  tempoMax: 110,
});

function panel(value: SongCustomizeValue) {
  return renderToStaticMarkup(
    createElement(SongCustomizePanel, {
      artistName: 'Nova',
      artistId: 'artist-1',
      defaults,
      value,
      onChange: () => {},
      prompt: 'a night drive',
      initialExpanded: true,
      requestDraft: async () => ({ lyrics: '', remaining: 3 }),
    })
  );
}

function preview(value: SongCustomizeValue) {
  return renderToStaticMarkup(
    createElement(SongCreatePreview, {
      artistName: 'Nova',
      defaults,
      value,
      onReset: () => {},
    })
  );
}

describe('song customize panel', () => {
  it('hides voice and words when the beat switch is on', () => {
    const off = panel(initialSongCustomize(defaults));
    assert.match(off, /Make it yours/);
    assert.match(off, /Nova(?:'|&#x27;)s voice · Nova writes the words · Chill, Happy, Steady/);
    assert.match(off, /Just the beat, no vocals/);
    assert.match(off, /data-chevron="true"/);
    assert.match(off, /data-open="true"/);
    assert.match(off, /rotate-180/);
    assert.match(off, /rounded-\[6px\]/);
    assert.match(off, /rounded-\[4px\]/);
    assert.match(off, /aria-checked="false"/);
    assert.match(off, /data-on="false"/);
    assert.match(off, /data-voice-display="only"/);
    assert.match(off, /Nova(?:'|&#x27;)s voice/);
    assert.equal(off.includes('Her voice'), false);
    assert.equal(off.includes('His voice'), false);
    assert.equal(off.includes('Same as Nova'), false);
    assert.equal(off.includes('data-voice="female"'), false);
    assert.equal(off.includes('data-voice="male"'), false);
    assert.match(off, /Let Nova write it/);
    assert.match(off, /Use my words/);
    assert.match(off, /min-h-12/);
    assert.match(off, /rounded-\[12px\]/);
    assert.match(off, /#14141C/);
    assert.match(off, /#2A2A38/);
    assert.match(off, /data-usual="true"/);
    assert.match(off, />Voice</);
    assert.match(off, />Words</);
    assert.match(off, />Feel</);
    assert.match(off, />Energy</);
    assert.equal(off.includes('How they sing'), false);
    assert.equal(off.includes('>Soft<'), false);
    assert.equal(off.includes('Smooth'), false);
    assert.equal(off.includes('Raspy'), false);
    assert.equal(off.includes('Powerful'), false);
    assert.equal(off.includes('Airy'), false);
    assert.equal(off.includes('BPM'), false);
    assert.equal(off.includes('gender'), false);
    assert.equal(off.includes('instrumental'), false);
    assert.equal(off.includes('lime'), false);
    assert.equal(off.includes('#C8F542'), false);

    const on = panel({ ...initialSongCustomize(defaults), instrumental: true });
    assert.match(on, /aria-checked="true"/);
    assert.match(on, /data-on="true"/);
    assert.match(on, /#E8E6F2/);
    assert.match(on, /#0A0A10/);
    assert.match(on, /data-feel="Chill"/);
    assert.match(on, /data-energy="Steady"/);
    assert.equal(on.includes('Her voice'), false);
    assert.equal(on.includes('Use my words'), false);
    assert.equal(on.includes('How they sing'), false);
    assert.equal(on.includes('Write a draft for me'), false);
  });

  it('renders the swapped feel chips and the preview sentence', () => {
    const next = toggleFeel(['Hype', 'Chill'] as FeelLabel[], 'Sad');
    assert.deepEqual(next, ['Chill', 'Sad']);
    const value: SongCustomizeValue = {
      ...initialSongCustomize(defaults),
      feel: next,
      energy: 'Fast',
      words: 'mine',
      lyrics: 'stay with me',
    };
    const html = panel(value);
    assert.match(html, /aria-pressed="false"[^>]*data-feel="Hype"/);
    assert.match(html, /aria-pressed="true"[^>]*data-feel="Chill"/);
    assert.match(html, /aria-pressed="true"[^>]*data-feel="Sad"/);
    assert.match(html, /usual/);
    assert.match(html, /placeholder="Write your words here"/);
    assert.match(html, /Tip: label parts like \[Verse\] and \[Chorus\]/);
    assert.match(html, /data-draft-button="true"[^>]*text-\[#E8E6F2\][^>]*>Write a draft for me/);
    assert.match(html, /data-draft-button="true"[^>]*bg-\[#14141C\]/);
    assert.match(html, /data-draft-button="true"[^>]*border-\[#2A2A38\]/);
    assert.equal(html.includes('Try another draft'), false);
    assert.equal(html.includes('data-lyrics-count'), false);

    const sentence = previewSentence({ artistName: 'Nova', value });
    assert.equal(sentence, 'Nova will make a chill, sad, fast song, singing your words.');
    const previewHtml = preview(value);
    assert.match(previewHtml, /Nova will make a chill, sad, fast song, singing your words\./);
    assert.match(previewHtml, /Back to Nova(?:'|&#x27;)s defaults/);
    assert.match(previewHtml, /min-h-11/);
    assert.equal(previewHtml.includes('exactly'), false);

    const quiet = preview(initialSongCustomize(defaults));
    assert.match(quiet, /Nova will make a chill, happy, steady song\./);
    assert.equal(quiet.includes('Back to Nova'), false);
  });

  it('asks before replacing edited words and hides the button at zero drafts', () => {
    const editing = renderToStaticMarkup(
      createElement(SongCustomizePanel, {
        artistName: 'Nova',
        defaults,
        value: { ...initialSongCustomize(defaults), words: 'mine', lyrics: 'my own line' },
        onChange: () => {},
        prompt: 'rain',
        initialExpanded: true,
        initialHasDraft: true,
        initialRemaining: 2,
      })
    );
    assert.match(editing, /data-draft-button="true"[^>]*>Try another draft \(2 left\)/);
    assert.match(editing, /text-\[#E8E6F2\]/);
    assert.equal(editing.includes('Replace your edits?'), false);
    assert.equal(editing.includes('data-lyrics-skeleton'), false);

    const spent = renderToStaticMarkup(
      createElement(SongCustomizePanel, {
        artistName: 'Nova',
        defaults,
        value: { ...initialSongCustomize(defaults), words: 'mine', lyrics: 'my own line' },
        onChange: () => {},
        prompt: 'rain',
        initialExpanded: true,
        initialDrafting: true,
        initialConfirming: true,
        initialRemaining: 0,
      })
    );
    assert.match(spent, /Replace your edits\?/);
    assert.match(spent, />Replace</);
    assert.match(spent, />Keep mine</);
    assert.match(spent, /data-lyrics-skeleton/);
    assert.equal(spent.includes('Try another draft'), false);
    assert.equal(spent.includes('Write a draft for me'), false);

    const editable = renderToStaticMarkup(
      createElement(SongCustomizePanel, {
        artistName: 'Nova',
        defaults,
        value: { ...initialSongCustomize(defaults), words: 'mine', lyrics: 'my own line' },
        onChange: () => {},
        prompt: 'rain',
        initialExpanded: true,
        initialHasDraft: true,
        initialRemaining: 0,
      })
    );
    assert.match(editable, /my own line/);
    assert.equal(editable.includes('Try another draft'), false);
    assert.equal(editable.includes('Write a draft for me'), false);

    const counted = renderToStaticMarkup(
      createElement(SongCustomizePanel, {
        artistName: 'Nova',
        defaults,
        value: { ...initialSongCustomize(defaults), words: 'mine', lyrics: 'a'.repeat(1840) },
        onChange: () => {},
        prompt: 'rain',
        initialExpanded: true,
      })
    );
    assert.match(counted, /data-lyrics-count="true"[^>]*#8B8896/);
    assert.match(counted, /1,840 \/ 2,000/);
    assert.equal(/data-lyrics-count="true"[^>]*#FF4D6A/.test(counted), false);

    const capped = renderToStaticMarkup(
      createElement(SongCustomizePanel, {
        artistName: 'Nova',
        defaults,
        value: { ...initialSongCustomize(defaults), words: 'mine', lyrics: 'a'.repeat(2000) },
        onChange: () => {},
        prompt: 'rain',
        initialExpanded: true,
        initialDraftError: "Couldn't write a draft.",
      })
    );
    assert.match(capped, /data-lyrics-count="true"[^>]*color:#FF4D6A/);
    assert.match(capped, /2,000 \/ 2,000/);
    assert.match(capped, /Couldn(?:'|&#x27;)t write a draft\./);

    const quietCount = renderToStaticMarkup(
      createElement(SongCustomizePanel, {
        artistName: 'Nova',
        defaults,
        value: { ...initialSongCustomize(defaults), words: 'mine', lyrics: 'a'.repeat(1800) },
        onChange: () => {},
        prompt: 'rain',
        initialExpanded: true,
      })
    );
    assert.equal(quietCount.includes('data-lyrics-count'), false);

    const closed = renderToStaticMarkup(
      createElement(SongCustomizePanel, {
        artistName: 'Nova',
        defaults,
        value: initialSongCustomize(defaults),
        onChange: () => {},
        prompt: '',
      })
    );
    assert.match(closed, /data-open="false"/);
    assert.equal(closed.includes('rotate-180'), false);
  });
});
