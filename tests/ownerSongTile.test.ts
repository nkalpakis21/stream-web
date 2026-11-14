import './render-setup';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  GENERATION_TIMEOUT_MS,
  attachOwnerSongListener,
  mergeOwnerSongSnapshot,
  ownerSongTileState,
  shouldListenForOwnerSong,
  tileViewAfterSnapshot,
} from '../lib/songs/ownerTile';

process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-key';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'test-project';
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = '1:1:web:test';

const cover = {
  coverPosterUrl: null,
  coverVideoUrl: null,
  coverMotionStatus: null,
  albumCoverPath: null,
  albumCoverThumbnail: null,
};

describe('owner song tiles', () => {
  it('shows Generating only to the owner and Failed when the server flag is set', () => {
    const generating = { audioReady: false, deletedAt: null, generationStatus: undefined };
    const failed = { audioReady: false, deletedAt: null, generationStatus: 'failed' as const };
    assert.equal(ownerSongTileState(generating, true), 'generating');
    assert.equal(ownerSongTileState(generating, false), null);
    assert.equal(ownerSongTileState(failed, true), 'failed');
    assert.equal(ownerSongTileState({ ...failed, deletedAt: 1 }, true), null);
    assert.equal(ownerSongTileState({ audioReady: true, generationStatus: 'failed' }, true), null);
  });

  it('shows Failed 15 minutes after createdAt and swaps to playable when audio lands', () => {
    const createdAt = 1_700_000_000_000;
    const shell = { audioReady: false as const, deletedAt: null, createdAt, generationStatus: null };
    assert.equal(
      ownerSongTileState(shell, true, createdAt + GENERATION_TIMEOUT_MS - 1),
      'generating'
    );
    assert.equal(
      ownerSongTileState(shell, true, createdAt + GENERATION_TIMEOUT_MS),
      'failed'
    );
    assert.equal(shouldListenForOwnerSong(shell, true), true);
    assert.equal(shouldListenForOwnerSong(shell, false), false);
    assert.equal(shouldListenForOwnerSong({ ...shell, audioReady: true }, true), false);

    const landed = tileViewAfterSnapshot(
      shell,
      { audioReady: true, generationStatus: null, isPublic: true },
      true,
      createdAt + GENERATION_TIMEOUT_MS + 5_000
    );
    assert.equal(landed.view, 'playable');
    assert.equal(landed.song.audioReady, true);
    assert.equal(shouldListenForOwnerSong(landed.song, true), false);

    const calls: string[] = [];
    const stop = attachOwnerSongListener(
      shouldListenForOwnerSong(shell, true),
      (onSnap) => {
        calls.push('subscribe');
        onSnap({ audioReady: true });
        return () => calls.push('unsubscribe');
      },
      (snap) => {
        const next = mergeOwnerSongSnapshot(shell, snap);
        assert.equal(ownerSongTileState(next, true, createdAt + 1_000), null);
      }
    );
    assert.deepEqual(calls, ['subscribe']);
    stop();
    assert.deepEqual(calls, ['subscribe', 'unsubscribe']);

    const ignored = attachOwnerSongListener(false, () => {
      calls.push('should-not');
      return () => {};
    }, () => {});
    ignored();
    assert.equal(calls.includes('should-not'), false);
  });

  it('renders Generating without a control and Failed with Retry and Delete', async () => {
    const { UnavailableAudioRowView } = await import('../components/songs/UnavailableAudioRow');
    const generating = renderToStaticMarkup(
      createElement(UnavailableAudioRowView, {
        title: 'Mr hanky',
        cover,
        state: 'generating',
        confirming: false,
        busy: false,
        error: null,
        onAskDelete: () => {},
        onCancel: () => {},
        onConfirm: () => {},
      })
    );
    assert.match(generating, /Mr hanky/);
    assert.match(generating, /Generating…/);
    assert.match(generating, /is-generating/);
    assert.match(generating, /audio-unavailable-cover/);
    assert.equal(generating.includes('href='), false);
    assert.equal(generating.includes('>Delete<'), false);
    assert.equal(generating.includes('>Retry<'), false);
    assert.equal(generating.includes('aria-label="Play'), false);

    const failed = renderToStaticMarkup(
      createElement(UnavailableAudioRowView, {
        title: 'Mr hanky',
        cover,
        state: 'failed',
        confirming: false,
        busy: false,
        error: null,
        onAskDelete: () => {},
        onCancel: () => {},
        onConfirm: () => {},
        onRetry: () => {},
      })
    );
    assert.match(failed, /Generation failed/);
    assert.match(failed, /audio-unavailable-meta is-failed/);
    assert.match(failed, />Retry</);
    assert.match(failed, /audio-unavailable-retry/);
    assert.match(failed, />Delete</);
    assert.equal(failed.includes('href='), false);
    assert.equal(failed.includes('Delete song?'), false);

    const sheet = renderToStaticMarkup(
      createElement(UnavailableAudioRowView, {
        title: 'Mr hanky',
        cover,
        state: 'failed',
        confirming: true,
        busy: false,
        error: null,
        onAskDelete: () => {},
        onCancel: () => {},
        onConfirm: () => {},
        onRetry: () => {},
      })
    );
    assert.match(sheet, /Delete song\?/);
  });

  it('keeps the shimmer static under reduced motion and the Ice retry target', () => {
    const css = readFileSync('components/songs/audio-unavailable.css', 'utf8');
    assert.match(css, /@keyframes audio-unavailable-shimmer/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /animation:\s*none/);
    assert.match(css, /#e8e6f2/);
    assert.match(css, /#0a0a10/);
    assert.match(css, /#ff4d6a/);
    assert.match(css, /min-height:\s*44px/);
    assert.match(css, /border-radius:\s*12px/);
    assert.match(css, /rgba\(232, 230, 242, 0\.6\)/);
  });

  it('shows the create-form failure with Retry', async () => {
    const { SongCreateFailureNotice } = await import('../components/dashboard/CreativeSongForm');
    const html = renderToStaticMarkup(
      createElement(SongCreateFailureNotice, { onRetry: () => {}, disabled: false })
    );
    assert.match(html, /Generation failed\. Try again\./);
    assert.match(html, />Retry</);
    assert.match(html, /role="alert"/);
  });
});
