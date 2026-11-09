import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  audioPointsAtMusicGpt,
  classifyAudioHttpStatus,
  isMusicGptAudioUrl,
  isOurStorageAudioUrl,
} from '../lib/server/songAudioUrl';
import { resolveSongAudioProject, SONG_AUDIO_PROJECTS } from '../lib/server/songAudioProjects';

const DEV_BUCKET = 'stream-dev-48098.firebasestorage.app';
const PROD_BUCKET = 'stream-prod-864df.firebasestorage.app';

describe('MusicGPT audio URL detection', () => {
  it('recognizes MusicGPT and lalals download hosts', () => {
    assert.equal(
      isMusicGptAudioUrl(
        'https://cdn1.musicgpt.com/conversions/api/standard/8725079f/8725079f.mp3'
      ),
      true
    );
    assert.equal(isMusicGptAudioUrl('https://api.musicgpt.com/audio/track.mp3'), true);
    assert.equal(isMusicGptAudioUrl('https://musicgpt.com/audio/track.mp3'), true);
    assert.equal(isMusicGptAudioUrl('http://cdn1.musicgpt.com/track.mp3'), true);
    assert.equal(isMusicGptAudioUrl('https://lalals.s3.amazonaws.com/conversions/a.mp3'), true);
    assert.equal(isMusicGptAudioUrl('https://cdn.lalals.com/audio/a.mp3'), true);
  });

  it('does not treat our Storage, Fal, or other CDNs as MusicGPT', () => {
    const stored = `https://firebasestorage.googleapis.com/v0/b/${DEV_BUCKET}/o/songs%2Fsong%2Faudio%2Fa.mp3?alt=media&token=t`;
    assert.equal(isMusicGptAudioUrl(stored), false);
    assert.equal(isMusicGptAudioUrl('https://v3.fal.media/files/look.jpg'), false);
    assert.equal(isMusicGptAudioUrl('https://cdn.example/victim.mp3'), false);
    assert.equal(isMusicGptAudioUrl(''), false);
    assert.equal(isMusicGptAudioUrl('not a url'), false);
  });

  it('recognizes this bucket and skips a foreign bucket', () => {
    const tokenUrl = `https://firebasestorage.googleapis.com/v0/b/${PROD_BUCKET}/o/songs%2Fsong%2Fcover%2Fposter.jpg?alt=media&token=t`;
    const gcsUrl = `https://storage.googleapis.com/${PROD_BUCKET}/songs/song/audio/a.mp3`;
    assert.equal(isOurStorageAudioUrl(tokenUrl, PROD_BUCKET), true);
    assert.equal(isOurStorageAudioUrl(gcsUrl, PROD_BUCKET), true);
    assert.equal(isOurStorageAudioUrl(`gs://${PROD_BUCKET}/songs/song/audio/a.mp3`, PROD_BUCKET), true);
    assert.equal(isOurStorageAudioUrl(tokenUrl, DEV_BUCKET), false);
    assert.equal(
      isOurStorageAudioUrl('https://cdn1.musicgpt.com/conversions/a.mp3', PROD_BUCKET),
      false
    );
    assert.equal(audioPointsAtMusicGpt(tokenUrl, PROD_BUCKET), false);
    assert.equal(
      audioPointsAtMusicGpt('https://cdn1.musicgpt.com/conversions/a.mp3', PROD_BUCKET),
      true
    );
  });

  it('classifies fetch results for the backfill summary', () => {
    assert.equal(classifyAudioHttpStatus(200), 'ok');
    assert.equal(classifyAudioHttpStatus(204), 'ok');
    assert.equal(classifyAudioHttpStatus(404), 'not_found');
    assert.equal(classifyAudioHttpStatus(410), 'not_found');
    assert.equal(classifyAudioHttpStatus(403), 'forbidden');
    assert.equal(classifyAudioHttpStatus(401), 'forbidden');
    assert.equal(classifyAudioHttpStatus(400), 'other');
    assert.equal(classifyAudioHttpStatus(500), 'failed');
    assert.equal(classifyAudioHttpStatus(0), 'failed');
  });
});

describe('song audio project selection', () => {
  it('maps stream-dev and prod to the buckets already used in each environment', () => {
    assert.equal(resolveSongAudioProject('stream-dev'), 'stream-dev');
    assert.equal(resolveSongAudioProject('dev'), 'stream-dev');
    assert.equal(resolveSongAudioProject('prod'), 'stream-prod');
    assert.equal(resolveSongAudioProject('stream-prod-864df'), 'stream-prod');
    assert.equal(resolveSongAudioProject('nope'), null);
    assert.equal(SONG_AUDIO_PROJECTS['stream-dev'].projectId, 'stream-dev-48098');
    assert.equal(SONG_AUDIO_PROJECTS['stream-dev'].bucket, 'stream-dev-48098.firebasestorage.app');
    assert.equal(SONG_AUDIO_PROJECTS['stream-prod'].projectId, 'stream-prod-864df');
    assert.equal(SONG_AUDIO_PROJECTS['stream-prod'].bucket, 'stream-prod-864df.firebasestorage.app');
  });
});
