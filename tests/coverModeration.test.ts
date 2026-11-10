import './render-setup';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoverModerationNoticeView } from '../components/songs/CoverModerationNoticeView';
import { CoverModerationProvider } from '../components/providers/CoverModerationProvider';
import {
  canModerateSongCover,
  coverIsPublic,
  coverModerationRetryable,
  coverOwnerNotice,
  isCoverModerationEnabled,
  ownerNoticeStatusAfterCall,
  resolveVisibleCover,
  safeSearchDecision,
} from '../lib/covers/moderation';
import {
  retryCoverModeration,
  screenSongCover,
  type CoverModerationRecord,
  type CoverModerationSong,
} from '../lib/server/coverModeration';
import { setVisionSafeSearchClientForTests } from '../lib/server/coverVision';
import { decideXCover, readSongModeration } from '../lib/x/blocklist';

const COVER = 'https://cdn.example/covers/flagged.jpg';
const FACE = 'https://cdn.example/artists/nova.jpg';

function song(status: 'pending' | 'passed' | 'flagged' | 'error' | null): CoverModerationSong {
  return {
    id: 'song-1',
    coverPosterUrl: COVER,
    albumCoverPath: 'https://cdn.example/covers/album.jpg',
    albumCoverThumbnail: null,
    coverModeration: status ? { status } : null,
  };
}

describe('cover moderation likelihood', () => {
  it('flags LIKELY and VERY_LIKELY for adult, violence, and racy', () => {
    for (const likelihood of ['LIKELY', 'VERY_LIKELY', 'likely', ' very_likely ']) {
      assert.equal(safeSearchDecision({ adult: likelihood, violence: 'UNLIKELY', racy: 'UNLIKELY' }), 'flagged');
      assert.equal(safeSearchDecision({ adult: 'UNLIKELY', violence: likelihood, racy: 'UNLIKELY' }), 'flagged');
      assert.equal(safeSearchDecision({ adult: 'UNLIKELY', violence: 'UNLIKELY', racy: likelihood }), 'flagged');
    }
  });

  it('passes POSSIBLE and anything below, and ignores medical and spoof', () => {
    assert.equal(
      safeSearchDecision({ adult: 'POSSIBLE', violence: 'UNLIKELY', racy: 'VERY_UNLIKELY' }),
      'passed'
    );
    assert.equal(safeSearchDecision({ adult: 'UNKNOWN', violence: '', racy: null }), 'passed');
    assert.equal(safeSearchDecision({ adult: 'POSSIBLE' }), 'passed');
  });

  it('turns on only for the string true', () => {
    assert.equal(isCoverModerationEnabled(undefined), false);
    assert.equal(isCoverModerationEnabled(''), false);
    assert.equal(isCoverModerationEnabled('TRUE'), false);
    assert.equal(isCoverModerationEnabled('1'), false);
    assert.equal(isCoverModerationEnabled(' true'), false);
    assert.equal(isCoverModerationEnabled('true'), true);
  });
});

describe('cover display', () => {
  const base = {
    coverPosterUrl: COVER,
    coverVideoUrl: 'https://cdn.example/covers/loop.mp4',
    coverMotionStatus: 'ready' as const,
    albumCoverPath: 'https://cdn.example/covers/album.jpg',
    albumCoverThumbnail: null,
  };

  it('shows the stored cover when the flag is off, even if the song is flagged', () => {
    const visible = resolveVisibleCover(
      { ...base, coverModeration: { status: 'flagged' } },
      { enabled: false, faceUrl: FACE, artistName: 'Nova' }
    );
    assert.equal(visible.fallback, false);
    assert.equal(visible.notice, null);
    assert.equal(visible.initials, null);
    assert.equal(visible.fields.coverPosterUrl, COVER);
    assert.equal(visible.fields.coverVideoUrl, 'https://cdn.example/covers/loop.mp4');
    assert.equal(coverIsPublic({ coverModeration: { status: 'flagged' } }, false), true);
  });

  it('uses the artist face when a cover is flagged, pending, or unchecked', () => {
    for (const status of ['flagged', 'pending', 'error', null] as const) {
      const visible = resolveVisibleCover(
        { ...base, coverModeration: status ? { status } : null },
        { enabled: true, faceUrl: FACE, artistName: 'Nova' }
      );
      assert.equal(visible.fallback, true);
      assert.equal(visible.fields.coverPosterUrl, FACE);
      assert.equal(visible.fields.coverVideoUrl, null);
      assert.equal(visible.fields.albumCoverPath, null);
      assert.equal(visible.initials, null);
      assert.equal(visible.fields.coverPosterUrl?.includes('flagged'), false);
    }
    const passed = resolveVisibleCover(
      { ...base, coverModeration: { status: 'passed' } },
      { enabled: true, faceUrl: FACE, artistName: 'Nova' }
    );
    assert.equal(passed.fallback, false);
    assert.equal(passed.fields.coverPosterUrl, COVER);
  });

  it('fills initials when moderation hides the cover and there is no face', () => {
    const visible = resolveVisibleCover(
      { ...base, coverModeration: { status: 'pending' } },
      { enabled: true, faceUrl: null, artistName: 'Nova Vale' }
    );
    assert.equal(visible.fields.coverPosterUrl, null);
    assert.equal(visible.initials, 'NV');
    assert.equal(visible.notice, null);
  });

  it('uses the owner copy for flagged and error only', () => {
    const flagged = coverOwnerNotice('flagged', 'Nova');
    assert.equal(
      flagged?.message,
      "This cover can't be shown publicly, so we're using Nova's face."
    );
    assert.equal(flagged?.buttonLabel, 'Try another cover');
    assert.equal(flagged?.action, 'replace');
    const errored = coverOwnerNotice('error', 'Nova');
    assert.equal(errored?.message, "We couldn't check this cover yet.");
    assert.equal(errored?.buttonLabel, 'Try again');
    assert.equal(errored?.action, 'retry');
    assert.equal(coverOwnerNotice('pending', 'Nova'), null);
    assert.equal(coverOwnerNotice('passed', 'Nova'), null);
    assert.equal(
      coverOwnerNotice('flagged', '  ')?.message,
      "This cover can't be shown publicly, so we're using the artist's face."
    );
  });

  it('keeps a passed object off X image posts', () => {
    const passed = readSongModeration({ coverModeration: { status: 'passed', checkedAt: 1 } });
    assert.equal(passed.imageModeration, 'none');
    assert.equal(passed.moderationFlagged, false);
    assert.equal(
      decideXCover({ openReports: false, moderationFlagged: false, imageModeration: passed.imageModeration }),
      'omit'
    );
    const flagged = readSongModeration({ coverModeration: { status: 'flagged' } });
    assert.equal(flagged.imageModeration, 'none');
    assert.equal(flagged.moderationFlagged, false);
  });
});

describe('cover moderation notice', () => {
  it('renders the ice button at least 44px and the muted line', () => {
    const html = renderToStaticMarkup(
      createElement(CoverModerationNoticeView, {
        message: "This cover can't be shown publicly, so we're using Nova's face.",
        buttonLabel: 'Try another cover',
      })
    );
    assert.match(html, /data-owner-cover-note/);
    assert.match(html, /color:var\(--mute\)/);
    assert.match(html, /listen-btn-primary/);
    assert.match(html, /min-height:44px/);
    assert.match(html, /Try another cover/);
    assert.equal(html.includes('Checking'), false);
    assert.equal(html.includes('Try again'), false);

    const busy = renderToStaticMarkup(
      createElement(CoverModerationNoticeView, {
        message: "We couldn't check this cover yet.",
        buttonLabel: 'Try again',
        busy: true,
      })
    );
    assert.match(busy, /We couldn&#x27;t check this cover yet\./);
    assert.match(busy, /Checking…/);
    assert.match(busy, /disabled/);
    assert.equal(busy.includes('Try again'), false);

    const retry = renderToStaticMarkup(
      createElement(CoverModerationNoticeView, {
        message: "We couldn't check this cover yet.",
        buttonLabel: 'Try again',
      })
    );
    assert.match(retry, /We couldn&#x27;t check this cover yet\./);
    assert.match(retry, /Try again/);
    assert.match(retry, /min-height:44px/);
  });
});

describe('cover moderation retry', () => {
  afterEach(() => {
    setVisionSafeSearchClientForTests(null);
  });

  function harness(initial: CoverModerationSong) {
    const saved: CoverModerationRecord[] = [];
    let current = initial;
    const calls: string[] = [];
    setVisionSafeSearchClientForTests(async () => {
      calls.push('vision');
      return { adult: 'VERY_LIKELY', violence: 'UNLIKELY', racy: 'POSSIBLE' };
    });
    const deps = {
      enabled: true,
      now: () => 1_700_000_000_000,
      loadSong: async () => current,
      saveModeration: async (_id: string, record: CoverModerationRecord) => {
        saved.push(record);
        current = { ...current, coverModeration: { status: record.status } };
      },
    };
    return { saved, calls, deps };
  }

  it('stores flagged for VERY_LIKELY and falls back the public cover', async () => {
    const { saved, calls, deps } = harness(song('pending'));
    const result = await retryCoverModeration('song-1', deps);
    assert.equal(result.status, 'flagged');
    assert.deepEqual(calls, ['vision']);
    assert.equal(saved[0]?.labels?.adult, 'VERY_LIKELY');
    assert.equal(saved[0]?.labels?.racy, 'POSSIBLE');
    const visible = resolveVisibleCover(
      { ...song('flagged'), coverModeration: { status: 'flagged' } },
      { enabled: true, faceUrl: FACE, artistName: 'Nova' }
    );
    assert.equal(visible.fields.coverPosterUrl, FACE);
    assert.equal(visible.notice?.buttonLabel, 'Try another cover');
  });

  it('passes POSSIBLE through the vision client', async () => {
    const { saved, deps } = harness(song('error'));
    setVisionSafeSearchClientForTests(async () => ({
      adult: 'POSSIBLE',
      violence: 'UNLIKELY',
      racy: 'VERY_UNLIKELY',
    }));
    const result = await retryCoverModeration('song-1', deps);
    assert.equal(result.status, 'passed');
    assert.equal(saved[0]?.status, 'passed');
    const visible = resolveVisibleCover(
      { coverPosterUrl: COVER, coverModeration: { status: 'passed' } },
      { enabled: true, faceUrl: FACE, artistName: 'Nova' }
    );
    assert.equal(visible.fields.coverPosterUrl, COVER);
    assert.equal(visible.notice, null);
  });

  it('fails closed when Vision throws and does not throw', async () => {
    const { saved, deps } = harness(song('pending'));
    setVisionSafeSearchClientForTests(async () => {
      throw new Error('Cloud Vision API has not been used in project stream-dev or billing is disabled');
    });
    const result = await retryCoverModeration('song-1', deps);
    assert.equal(result.ok, false);
    assert.equal(result.status, 'error');
    assert.equal(result.reason, 'vision_failed');
    assert.equal(saved[0]?.status, 'error');
    assert.equal(saved[0]?.labels, null);
    const visible = resolveVisibleCover(
      { coverPosterUrl: COVER, coverModeration: { status: 'error' } },
      { enabled: true, faceUrl: FACE, artistName: 'Nova' }
    );
    assert.equal(visible.fields.coverPosterUrl, FACE);
    assert.equal(visible.notice?.message, "We couldn't check this cover yet.");
  });

  it('does not call Vision or change the cover when the flag is off', async () => {
    let called = false;
    setVisionSafeSearchClientForTests(async () => {
      called = true;
      return { adult: 'VERY_LIKELY', violence: 'LIKELY', racy: 'LIKELY' };
    });
    const result = await screenSongCover('song-1', {
      enabled: false,
      loadSong: async () => song('flagged'),
      saveModeration: async () => {
        throw new Error('should not write');
      },
    });
    assert.equal(called, false);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'disabled');
  });

  it('retries error and pending, and skips passed and flagged', async () => {
    assert.equal(coverModerationRetryable('error'), true);
    assert.equal(coverModerationRetryable('pending'), true);
    assert.equal(coverModerationRetryable('passed'), false);
    assert.equal(coverModerationRetryable('flagged'), false);

    const pending = harness(song('pending'));
    await retryCoverModeration('song-1', pending.deps);
    assert.equal(pending.calls.length, 1);

    const passed = harness(song('passed'));
    const skipped = await retryCoverModeration('song-1', passed.deps);
    assert.equal(skipped.skipped, true);
    assert.equal(skipped.reason, 'not_retryable');
    assert.deepEqual(passed.calls, []);

    const flagged = harness(song('flagged'));
    const again = await retryCoverModeration('song-1', flagged.deps);
    assert.equal(again.reason, 'not_retryable');
    assert.deepEqual(flagged.calls, []);

    const errored = harness(song('error'));
    const retried = await retryCoverModeration('song-1', errored.deps);
    assert.equal(retried.status, 'flagged');
    const second = await retryCoverModeration('song-1', errored.deps);
    assert.equal(second.skipped, true);
    assert.equal(second.reason, 'not_retryable');
    assert.equal(errored.calls.length, 1);
  });

  it('stores error when the cover URL is missing and does not call Vision', async () => {
    const saved: CoverModerationRecord[] = [];
    setVisionSafeSearchClientForTests(async () => {
      throw new Error('should not annotate');
    });
    const result = await retryCoverModeration('song-1', {
      enabled: true,
      now: () => 5,
      loadSong: async () => ({ id: 'song-1', coverPosterUrl: null, coverModeration: { status: 'error' } }),
      saveModeration: async (_id, record) => {
        saved.push(record);
      },
    });
    assert.equal(result.status, 'error');
    assert.equal(result.reason, 'no_image');
    assert.equal(saved[0]?.status, 'error');
  });

  it('keeps the owner note when the call fails', () => {
    assert.equal(ownerNoticeStatusAfterCall('retry', false, 'error'), null);
    assert.equal(ownerNoticeStatusAfterCall('replace', false, 'pending'), null);
    assert.equal(ownerNoticeStatusAfterCall('retry', true, 'passed'), 'passed');
    assert.equal(ownerNoticeStatusAfterCall('replace', true, 'flagged'), 'flagged');
    assert.equal(ownerNoticeStatusAfterCall('replace', true, 'passed'), null);
  });

  it('allows the owner or an admin to run the check', () => {
    assert.equal(canModerateSongCover('owner', 'owner', false), true);
    assert.equal(canModerateSongCover('admin', 'owner', true), true);
    assert.equal(canModerateSongCover('stranger', 'owner', false), false);
    assert.equal(canModerateSongCover('', 'owner', true), false);
  });
});

describe('public cover slot', () => {
  it('fans see the face and no owner message when the cover is flagged', async () => {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-key';
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'test-project';
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = '1:1:web:test';
    const [{ DiscoverSongCard }, { SongPlayerStaticProvider }] = await Promise.all([
      import('../components/discover/DiscoverSongCard'),
      import('../components/songs/SongPlayerProvider'),
    ]);
    const songDoc = {
      id: 'song-1',
      ownerId: 'owner',
      artistId: 'artist-1',
      artistVersionId: 'ver',
      title: 'Night Bus',
      isPublic: true,
      createdAt: { toMillis: () => 0 },
      updatedAt: { toMillis: () => 0 },
      deletedAt: null,
      currentVersionId: 'ver',
      parentSongId: null,
      collaborationType: null,
      albumCoverPath: null,
      albumCoverThumbnail: null,
      coverPosterUrl: COVER,
      coverVideoUrl: 'https://cdn.example/covers/loop.mp4',
      coverMotionStatus: 'ready',
      coverModeration: { status: 'flagged', checkedAt: null, labels: { adult: 'VERY_LIKELY' } },
    };
    const artist = { id: 'artist-1', name: 'Nova', photoUrl: FACE, isPublic: true };
    const card = createElement(DiscoverSongCard, { song: songDoc as never, artist, artistName: 'Nova' });
    const flagged = renderToStaticMarkup(
      createElement(CoverModerationProvider, {
        enabled: true,
        children: createElement(SongPlayerStaticProvider, null, card),
      })
    );
    assert.match(flagged, new RegExp(FACE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(flagged.includes(COVER), false);
    assert.equal(flagged.includes('loop.mp4'), false);
    assert.equal(flagged.includes("can't be shown"), false);
    assert.equal(flagged.includes('Try another cover'), false);
    assert.equal(flagged.includes('Try again'), false);

    const [{ CoverImage }] = await Promise.all([import('../components/media/CoverImage')]);
    const initials = renderToStaticMarkup(
      createElement(CoverImage, {
        src: null,
        title: 'Night Bus',
        sizes: '40px',
        emptyInitials: 'NV',
      })
    );
    assert.match(initials, /cover-fallback-initials/);
    assert.match(initials, /artist-index-face-initials/);
    assert.match(initials, />NV</);
    assert.equal(initials.includes('font-size:28px'), false);
    const css = readFileSync('components/media/cover-media.css', 'utf8');
    assert.match(css, /\.cover-fallback-initials-text\s*\{[^}]*font-size:\s*36cqmin/s);

    const legacy = renderToStaticMarkup(
      createElement(CoverModerationProvider, {
        enabled: false,
        children: createElement(SongPlayerStaticProvider, null, card),
      })
    );
    assert.match(legacy, new RegExp(COVER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(legacy.includes("can't be shown"), false);
  });
});
