import './render-setup';
import assert from 'node:assert/strict';
import { createElement, createRef } from 'react';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CreateFlowView } from '../components/create/CreateFlowView';
import {
  artistNameError,
  artistNameIssue,
  canSubmitCreate,
  parseCreateDraft,
  submittedFace,
  titleFromPrompt,
  SONG_PROMPT_PLACEHOLDER,
} from '../lib/create/oneFlow';
import { legacyArtistCreateHref, studioHrefFromCreateSearch } from '../lib/create/paths';
import { elapsedMsSinceSubmit, firstSongReadyProps } from '../lib/server/songReady';
import {
  SONG_READY_BODY,
  expoUnregisteredTokens,
  isExpoPushToken,
  notifyOwnerSongReady,
  pushTokenDocId,
  setSongReadyPushForTests,
  songReadyMessageText,
  songReadyPushMessages,
} from '../lib/server/expoPush';

describe('one-flow create helpers', () => {
  it('titles a song from the prompt and validates the name', () => {
    assert.equal(titleFromPrompt('a midnight soul song about leaving the city.'), 'A Midnight Soul Song About Leaving');
    assert.equal(titleFromPrompt('   '), 'New song');
    assert.equal(artistNameIssue(''), 'empty');
    assert.equal(artistNameIssue('J'), 'length');
    assert.equal(artistNameIssue('Jimmy'), null);
    assert.equal(artistNameIssue('a'.repeat(33)), 'length');
    assert.equal(artistNameIssue('Jimmy!'), 'charset');
    assert.equal(artistNameError('length', false), 'Use 2 to 32 characters.');
    assert.equal(artistNameError('charset', false), 'Use letters, numbers, spaces, hyphens, or underscores.');
    assert.equal(artistNameError(null, true), 'That name is taken.');
    assert.equal(canSubmitCreate('Jimmy', 'a rainy chorus'), true);
    assert.equal(canSubmitCreate('J', 'a rainy chorus'), false);
    assert.equal(canSubmitCreate('Jimmy', '  '), false);
  });

  it('records generate while a look is still running, and none for a skip', () => {
    assert.equal(
      submittedFace({ method: null, hasUrl: false, generateInFlight: true, uploadInFlight: false }),
      'generate'
    );
    assert.equal(
      submittedFace({ method: 'upload', hasUrl: true, generateInFlight: false, uploadInFlight: false }),
      'upload'
    );
    assert.equal(
      submittedFace({ method: null, hasUrl: false, generateInFlight: false, uploadInFlight: false }),
      'none'
    );
    const draft = parseCreateDraft({
      name: 'Jimmy',
      prompt: 'rain',
      faceUrl: 'https://cdn.example/face.jpg',
      faceMethod: 'generate',
      faceUrlBlob: 'blob:local',
    });
    assert.equal(draft.faceUrl, 'https://cdn.example/face.jpg');
    assert.equal(draft.faceMethod, 'generate');
    assert.equal(parseCreateDraft({ faceUrl: 'not a url' }).faceUrl, null);
  });

  it('measures elapsedMs from the submit timestamp', () => {
    const start = 1_000;
    assert.equal(elapsedMsSinceSubmit({ toMillis: () => start }, start + 4500), 4500);
    assert.equal(elapsedMsSinceSubmit(null, start), null);
    assert.equal(elapsedMsSinceSubmit(start, start - 1), null);
    assert.deepEqual(
      firstSongReadyProps(
        { id: 'song-1', artistId: 'artist-1', createSubmittedAt: start },
        'task-1',
        start + 900
      ),
      { songId: 'song-1', taskId: 'task-1', artistId: 'artist-1', elapsedMs: 900 }
    );
  });

  it('builds an Expo song-ready payload with the exact data keys', () => {
    const token = 'ExponentPushToken[abc12345]';
    assert.equal(isExpoPushToken(token), true);
    assert.equal(isExpoPushToken('plain'), false);
    assert.equal(pushTokenDocId(token), pushTokenDocId(token));
    assert.notEqual(pushTokenDocId(token), pushTokenDocId(`${token}x`));
    assert.equal(songReadyMessageText('Midnight Drive'), 'Midnight Drive is ready');
    const [message] = songReadyPushMessages([token, 'nope'], {
      title: 'Midnight Drive',
      songId: 'song-1',
      artistId: 'artist-1',
    });
    assert.equal(message?.to, token);
    assert.equal(message?.title, 'Midnight Drive is ready');
    assert.equal(message?.body, SONG_READY_BODY);
    assert.equal(message?.body, 'Tap to play');
    assert.deepEqual(message?.data, { type: 'song_ready', songId: 'song-1', artistId: 'artist-1' });
    assert.deepEqual(Object.keys(message?.data ?? {}).sort(), ['artistId', 'songId', 'type']);
  });

  it('drops only tokens Expo reports as DeviceNotRegistered', async () => {
    const stale = 'ExponentPushToken[stale1234]';
    const live = 'ExponentPushToken[live12345]';
    const deleted: string[] = [];
    setSongReadyPushForTests({
      tokens: async () => [stale, live],
      send: async () => ({
        data: [
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
          { status: 'ok', id: 'ticket-1' },
        ],
      }),
      deleteToken: async (_uid, token) => {
        deleted.push(token);
      },
    });
    notifyOwnerSongReady({
      ownerId: 'alice',
      title: 'Midnight Drive',
      songId: 'song-1',
      artistId: 'artist-1',
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(deleted, [stale]);
    assert.deepEqual(
      expoUnregisteredTokens(
        [{ to: stale }, { to: live }],
        { data: [{ status: 'error', details: { error: 'MessageRateExceeded' } }, { status: 'ok' }] }
      ),
      []
    );
    setSongReadyPushForTests(null);
  });
});

describe('create screen', () => {
  it('renders the face, moods, and ice submit button without lime', () => {
    const html = renderToStaticMarkup(
      createElement(CreateFlowView, {
        name: 'Jimmy',
        onNameChange: () => {},
        nameError: 'That name is taken.',
        prompt: '',
        onPromptChange: () => {},
        promptError: null,
        activeMood: null,
        onMood: () => {},
        lookPrompt: '',
        onLookPromptChange: () => {},
        faceUrl: null,
        framingSrc: null,
        onPickFile: () => {},
        onUsePhoto: () => {},
        onCancelFrame: () => {},
        onGenerate: () => {},
        generating: false,
        uploading: false,
        looks: [],
        onPickLook: () => {},
        onSkip: () => {},
        faceError: null,
        coin: createElement('p', null, 'Launch a coin (optional)'),
        coinError: null,
        submitError: null,
        canSubmit: false,
        submitting: false,
        onSubmit: () => {},
        fileInputRef: createRef<HTMLInputElement>(),
      })
    );
    assert.match(html, /data-face-initials/);
    assert.match(html, />J</);
    assert.doesNotMatch(html, />JI</);
    assert.match(html, /Upload photo/);
    assert.match(html, /Generate/);
    assert.match(html, /min-h-11/);
    assert.match(html, /Late night/);
    assert.match(html, /Sunrise/);
    assert.match(html, /Storm/);
    assert.ok(html.indexOf('Look prompt') < html.indexOf('Upload photo'));
    assert.match(html, /border-\[#2A2A38\]/);
    assert.equal((html.match(/That name is taken/g) || []).length, 1);
    assert.match(html, /rounded-\[12px\]/);
    assert.match(html, /rounded-full/);
    assert.match(html, /h-12/);
    assert.match(html, /h-\[52px\]/);
    assert.match(html, /#E8E6F2/);
    assert.match(html, /#0A0A10/);
    assert.match(html, /#14141C/);
    assert.match(html, /Create artist/);
    assert.match(html, /disabled/);
    assert.match(html, /That name is taken/);
    assert.match(html, new RegExp(SONG_PROMPT_PLACEHOLDER.slice(0, 24)));
    assert.match(html, /Launch a coin \(optional\)/);
    assert.match(html, /md:grid-cols-\[220px_minmax\(0,1fr\)\]/);
    assert.doesNotMatch(html, /#C8F542/);
    assert.doesNotMatch(html, /lime/);

    const empty = renderToStaticMarkup(
      createElement(CreateFlowView, {
        name: '',
        onNameChange: () => {},
        nameError: null,
        prompt: '',
        onPromptChange: () => {},
        promptError: null,
        activeMood: null,
        onMood: () => {},
        lookPrompt: '',
        onLookPromptChange: () => {},
        faceUrl: null,
        framingSrc: null,
        onPickFile: () => {},
        onUsePhoto: () => {},
        onCancelFrame: () => {},
        onGenerate: () => {},
        generating: true,
        uploading: false,
        looks: [],
        onPickLook: () => {},
        onSkip: () => {},
        faceError: null,
        coin: null,
        coinError: null,
        submitError: null,
        canSubmit: false,
        submitting: false,
        onSubmit: () => {},
        fileInputRef: createRef<HTMLInputElement>(),
      })
    );
    assert.match(empty, /data-face-placeholder/);
    assert.doesNotMatch(empty, /data-face-initials/);
    assert.equal((empty.match(/data-look-skeleton/g) || []).length, 4);
    assert.match(empty, /motion-safe:animate-pulse/);
    assert.match(empty, /rounded-\[12px\]/);

    const uploading = renderToStaticMarkup(
      createElement(CreateFlowView, {
        name: 'Jimmy',
        onNameChange: () => {},
        nameError: null,
        prompt: 'rain',
        onPromptChange: () => {},
        promptError: null,
        activeMood: null,
        onMood: () => {},
        lookPrompt: '',
        onLookPromptChange: () => {},
        faceUrl: null,
        framingSrc: 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=',
        onPickFile: () => {},
        onUsePhoto: () => {},
        onCancelFrame: () => {},
        onGenerate: () => {},
        generating: false,
        uploading: true,
        looks: [],
        onPickLook: () => {},
        onSkip: () => {},
        faceError: null,
        coin: null,
        coinError: null,
        submitError: null,
        canSubmit: true,
        submitting: false,
        onSubmit: () => {},
        fileInputRef: createRef<HTMLInputElement>(),
      })
    );
    assert.match(uploading, /Uploading…/);
    assert.match(uploading, /data-face-busy="true"/);
    assert.match(uploading, /opacity-40/);
    assert.doesNotMatch(uploading, />Use photo</);
  });
});

describe('legacy create routes', () => {
  it('sends the old artist form to /create and keeps extra query params', () => {
    assert.equal(legacyArtistCreateHref('tab=artists&new=1'), '/create');
    assert.equal(legacyArtistCreateHref('tab=artists&new=1&ref=home'), '/create?ref=home');
    assert.equal(legacyArtistCreateHref('tab=songs&new=1'), null);
    assert.equal(studioHrefFromCreateSearch('step=artist'), '/create');
    assert.equal(
      studioHrefFromCreateSearch('step=song&artistId=abc'),
      '/dashboard?tab=songs&new=1&artistId=abc'
    );
  });
});
