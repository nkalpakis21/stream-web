import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sanitizeFunnelProps, isClientFunnelEvent, isFunnelEvent } from '../lib/server/funnel';
import {
  accountSingOver,
  addCredit,
  BEAT_FIRST_TARGET_USD,
  BEAT_FIRST_WORST_USD,
  BEAT_RETRY_CAP,
  countsTowardTimeToSong,
  holdBeatPublish,
  lyricsNeeded,
  msFromFirstBeat,
  nextBeatRetry,
  retriesLeft,
  showHearBeatFirst,
  singOverPromptText,
  studioBeatLabel,
  makeNewBeatLabel,
  tryAnotherBeatLabel,
  unfinishedBeat,
} from '../lib/songs/beatFirst';
import { parseBeatRequest, parseVocalsRequest } from '../lib/server/beatFirst';
import {
  buildSingOverForm,
  canDownloadSourceAudio,
  musicGptSingOverUrl,
  readSingOverTask,
  singOverGender,
  singOverTextFields,
} from '../lib/server/singOver';

describe('beat-first rules', () => {
  it('hides the entry on the first artist and when the beat switch is on', () => {
    assert.equal(showHearBeatFirst({ firstArtist: false, instrumental: false }), true);
    assert.equal(showHearBeatFirst({ firstArtist: true, instrumental: false }), false);
    assert.equal(showHearBeatFirst({ firstArtist: false, instrumental: true }), false);
  });

  it('allows two beat retries and then stops', () => {
    assert.equal(BEAT_RETRY_CAP, 2);
    assert.equal(nextBeatRetry(0), 1);
    assert.equal(nextBeatRetry(1), 2);
    assert.equal(nextBeatRetry(2), null);
    assert.equal(retriesLeft(0), 2);
    assert.equal(retriesLeft(1), 1);
    assert.equal(retriesLeft(2), 0);
    assert.equal(tryAnotherBeatLabel(0), 'Try another beat (2 left)');
    assert.equal(tryAnotherBeatLabel(1), 'Try another beat (1 left)');
    assert.equal(tryAnotherBeatLabel(2), 'No beats left');
    assert.equal(makeNewBeatLabel(0), 'Make a new beat (2 left)');
    assert.equal(makeNewBeatLabel(1), 'Make a new beat (1 left)');
    assert.equal(makeNewBeatLabel(2), 'Make a new beat (0 left)');
  });

  it('keeps a beat-first song out of the time-to-song metric', () => {
    assert.equal(countsTowardTimeToSong('beat_first'), false);
    assert.equal(countsTowardTimeToSong(undefined), true);
    assert.equal(countsTowardTimeToSong('song'), true);
    assert.equal(msFromFirstBeat(1_000, 4_500), 3500);
    assert.equal(msFromFirstBeat(null, 4_500), null);
    assert.ok(BEAT_FIRST_TARGET_USD < BEAT_FIRST_WORST_USD);
    assert.ok(BEAT_FIRST_WORST_USD <= 0.2);
  });

  it('holds publish for the instrumental and not for Sing Over', () => {
    assert.equal(holdBeatPublish({ path: 'beat_first', job: 'beat', stage: 'generating' }), true);
    assert.equal(holdBeatPublish({ path: 'beat_first', job: 'beat', stage: 'ready' }), true);
    assert.equal(holdBeatPublish({ path: 'beat_first', job: 'sing_over', stage: 'singing' }), false);
    assert.equal(holdBeatPublish({ path: undefined, job: 'beat', stage: 'generating' }), false);
  });

  it('labels a studio draft and leaves a finished song on the normal card', () => {
    assert.equal(
      studioBeatLabel({ path: 'beat_first', audioReady: false, beatFirst: { stage: 'ready' } }),
      'Beat ready · Add vocals'
    );
    assert.equal(
      studioBeatLabel({ path: 'beat_first', audioReady: true, beatFirst: { stage: 'vocals' } }),
      null
    );
    assert.equal(
      unfinishedBeat({ path: 'beat_first', audioReady: false, beatFirst: { stage: 'singing' } }),
      true
    );
  });

  it('builds a Sing Over prompt from style, feel, energy, and the song idea', () => {
    const prompt = singOverPromptText({
      musicStyle: 'warm alto, indie',
      feel: ['Chill'],
      energy: 'Slow',
      idea: 'a night drive',
    });
    assert.match(prompt, /warm alto, indie/);
    assert.match(prompt, /Chill/);
    assert.match(prompt, /Slow/);
    assert.match(prompt, /a night drive/);
  });

  it('drafts words only when the owner did not supply them', () => {
    assert.equal(lyricsNeeded('artist', ''), true);
    assert.equal(lyricsNeeded('mine', '  '), true);
    assert.equal(lyricsNeeded('mine', 'hello'), false);
  });

  it('parses a start body and rejects a missing prompt', () => {
    const parsed = parseBeatRequest({
      artistId: 'artist-1',
      title: 'Night',
      prompt: 'drive',
      feel: ['Chill', 'Nope'],
      energy: 'Fast',
      idempotencyKey: 'idem-key-1',
    });
    assert.deepEqual(parsed.feel, ['Chill']);
    assert.equal(parsed.energy, 'Fast');
    assert.equal(parsed.idempotencyKey, 'idem-key-1');
    assert.throws(() => parseBeatRequest({ artistId: 'a', title: 't' }), /prompt/i);
    const vocals = parseVocalsRequest({
      versionId: 'ver-1',
      voice: 'female',
      words: 'mine',
      lyrics: 'line',
      sessionId: 'session-1',
    });
    assert.equal(vocals.voice, 'female');
    assert.equal(vocals.words, 'mine');
  });
});

describe('sing over', () => {
  it('posts multipart audio_file and never audio_url', () => {
    assert.equal(
      musicGptSingOverUrl('https://api.musicgpt.com/api/public/v1'),
      'https://api.musicgpt.com/api/public/v1/sing_over_instrumental'
    );
    assert.equal(singOverGender('same'), undefined);
    assert.equal(singOverGender('female'), 'female');
    const same = singOverTextFields({
      prompt: 'warm alto. Chill. Slow',
      lyrics: '[Verse]\nhi',
      voice: 'same',
      webhookUrl: 'https://example.com/hook',
    });
    assert.equal('audio_url' in same, false);
    assert.equal(same.gender, undefined);
    const form = buildSingOverForm(same, {
      bytes: new Uint8Array([1, 2, 3]),
      contentType: 'audio/mpeg',
      filename: 'source.mp3',
    });
    const keys = [...form.keys()];
    assert.equal(keys.includes('audio_url'), false);
    assert.equal(keys.includes('audio_file'), true);
    assert.equal(keys.includes('gender'), false);
    assert.equal(keys.includes('prompt'), true);
    assert.equal(keys.includes('lyrics'), true);
    const female = singOverTextFields({ prompt: 'p', lyrics: 'l', voice: 'male' });
    assert.equal(female.gender, 'male');
  });

  it('refuses to download an arbitrary host', () => {
    assert.equal(canDownloadSourceAudio('http://169.254.169.254/latest'), false);
    assert.equal(canDownloadSourceAudio('https://evil.example/a.mp3'), false);
    assert.equal(canDownloadSourceAudio('https://cdn1.musicgpt.com/a.mp3'), true);
  });

  it('reads the task id and enforces a caller cap without being beat-specific', () => {
    const task = readSingOverTask({
      task_id: 'task-1',
      conversion_id_1: 'c1',
      conversion_id_2: 'c2',
      credit_estimate: 0.04,
    });
    assert.equal(task.taskId, 'task-1');
    assert.deepEqual(task.conversionIds, ['c1', 'c2']);
    assert.equal(task.creditEstimate, 0.04);
    const first = accountSingOver(null, 0.04, null);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.account.attempts, 1);
    assert.equal(first.account.creditEstimate, 0.04);
    const capped = accountSingOver(first.account, 0.04, 1);
    assert.deepEqual(capped, { ok: false, reason: 'cap' });
    assert.equal(addCredit(0.04, 0.045), 0.085);
  });
});

describe('beat-first funnel', () => {
  it('keeps beat events server-only and drops anything that is not an id or a counter', () => {
    for (const event of [
      'beat_first_started',
      'beat_regenerated',
      'beat_picked',
      'vocals_added',
      'used_as_instrumental',
    ]) {
      assert.equal(isFunnelEvent(event), true);
      assert.equal(isClientFunnelEvent(event), false);
    }
    assert.deepEqual(
      sanitizeFunnelProps({
        songId: 'song-1',
        artistId: 'artist-1',
        retriesUsed: 2,
        vocalsAdded: false,
        msFromFirstBeat: 120000,
        email: 'a@b.c',
        prompt: 'secret lyrics',
        audioUrl: 'https://cdn.example/a.mp3',
      }),
      {
        songId: 'song-1',
        artistId: 'artist-1',
        retriesUsed: 2,
        vocalsAdded: false,
        msFromFirstBeat: 120000,
      }
    );
    assert.deepEqual(sanitizeFunnelProps({ retriesUsed: 3 }), {});
    assert.deepEqual(sanitizeFunnelProps({ msFromFirstBeat: -1 }), {});
  });
});
