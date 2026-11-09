import './render-setup';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-key';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'test-project';
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = '1:1:web:test';

describe('owner unavailable audio row', () => {
  it('greys the row, offers Delete, and confirms with Delete song?', async () => {
    const { UnavailableAudioRowView } = await import('../components/songs/UnavailableAudioRow');
    const cover = {
      coverPosterUrl: null,
      coverVideoUrl: null,
      coverMotionStatus: null,
      albumCoverPath: null,
      albumCoverThumbnail: null,
    };
    const html = renderToStaticMarkup(
      createElement(UnavailableAudioRowView, {
        title: 'Lost tape',
        cover,
        confirming: false,
        busy: false,
        error: null,
        onAskDelete: () => {},
        onCancel: () => {},
        onConfirm: () => {},
      })
    );
    assert.match(html, /Lost tape/);
    assert.match(html, /Audio unavailable/);
    assert.match(html, />Delete</);
    assert.match(html, /audio-unavailable-title/);
    assert.match(html, /audio-unavailable-cover/);
    assert.match(html, /aspect-square/);
    assert.equal(html.includes('col-span-full'), false);
    assert.equal(html.includes('href='), false);
    assert.equal(html.includes('aria-label="Play'), false);
    assert.equal(html.includes('>Play<'), false);
    assert.equal(html.includes('Delete song?'), false);

    const sheet = renderToStaticMarkup(
      createElement(UnavailableAudioRowView, {
        title: 'Lost tape',
        cover,
        confirming: true,
        busy: false,
        error: null,
        onAskDelete: () => {},
        onCancel: () => {},
        onConfirm: () => {},
      })
    );
    assert.match(sheet, /Delete song\?/);
    assert.match(sheet, />Cancel</);
    assert.match(sheet, /audio-unavailable-confirm/);
    assert.match(sheet, /audio-unavailable-sheet/);
  });

  it('matches the ice meta line, down Delete control, and 12px sheet', () => {
    const css = readFileSync('components/songs/audio-unavailable.css', 'utf8');
    assert.match(css, /font-family:\s*var\(--font-figtree\)/);
    assert.match(css, /font-size:\s*13px/);
    assert.match(css, /rgba\(232, 230, 242, 0\.6\)/);
    assert.match(css, /opacity:\s*0\.4/);
    assert.match(css, /border-radius:\s*12px/);
    assert.match(css, /min-height:\s*44px/);
    assert.match(css, /#ff4d6a/);
    assert.match(css, /#14141C/);
    assert.equal(css.includes('#12121a'), false);
    assert.equal(readFileSync('components/songs/UnavailableAudioRow.tsx', 'utf8').includes('col-span-full'), false);

    const page = readFileSync('app/artists/[id]/page.tsx', 'utf8');
    assert.match(page, /adminListVersionsForSongs/);
    assert.match(page, /selectArtistPageSongs\(/);
    assert.match(page, /audioUnavailable/);
    assert.match(page, /UnavailableAudioRow/);
    const row = readFileSync('components/songs/UnavailableAudioRow.tsx', 'utf8');
    assert.match(row, /method: 'DELETE'/);
    assert.match(row, /\/api\/songs\/\$\{songId\}/);
    assert.equal(row.toLowerCase().includes('regenerat'), false);
  });
});
