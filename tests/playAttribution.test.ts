import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countedPlayLogLine,
  normalizePlaySource,
  songPatchMode,
} from '../lib/server/playAttribution';

describe('play attribution', () => {
  it('accepts source, background, and unknown fields on an increment', () => {
    const parsed = songPatchMode({
      playCount: 'increment',
      source: 'ios',
      background: true,
      build: 15,
      deviceId: 'ignore-me',
    });
    assert.deepEqual(parsed, {
      mode: 'increment',
      source: 'ios',
      background: true,
    });
  });

  it('maps an unknown source to other', () => {
    assert.equal(normalizePlaySource('watch'), 'other');
    assert.equal(normalizePlaySource(''), 'other');
    assert.equal(normalizePlaySource(15), 'other');
    const parsed = songPatchMode({
      playCount: 'increment',
      source: 'desktop',
      background: false,
    });
    assert.equal(parsed.mode, 'increment');
    if (parsed.mode === 'increment') {
      assert.equal(parsed.source, 'other');
      assert.equal(parsed.background, false);
    }
  });

  it('records nothing for a rate-limited play', () => {
    assert.equal(
      countedPlayLogLine({
        songId: 'song-1',
        source: 'ios',
        background: true,
        reservation: 'limited',
      }),
      null
    );
  });

  it('logs a counted play without an IP or uid', () => {
    const line = countedPlayLogLine({
      songId: 'song-1',
      source: 'android',
      background: false,
      reservation: 'counted',
    });
    assert.equal(
      line,
      'play_counted {"songId":"song-1","source":"android","background":false}'
    );
    assert.equal(line?.includes('203.0.113'), false);
    assert.equal(line?.includes('uid'), false);
  });
});
