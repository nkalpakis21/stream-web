import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countedPlayFieldUpdates,
  countedPlayLogLine,
  songPatchMode,
} from '../lib/server/playAttribution';

const INCREMENT = { __op: 'increment', n: 1 };

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

  it('counts a bad source as playCount only, with no source field', () => {
    const parsed = songPatchMode({
      playCount: 'increment',
      source: 'desktop',
      background: false,
    });
    assert.equal(parsed.mode, 'increment');
    if (parsed.mode !== 'increment') return;

    assert.equal(parsed.source, null);
    const updates = countedPlayFieldUpdates(
      { source: parsed.source, background: parsed.background },
      'counted',
      INCREMENT
    );
    assert.deepEqual(updates, { playCount: INCREMENT });
    assert.equal(Object.keys(updates ?? {}).some((key) => key.startsWith('playsBySource')), false);
    assert.equal(JSON.stringify(updates).includes('desktop'), false);
  });

  it('ignores a non-boolean background', () => {
    const parsed = songPatchMode({
      playCount: 'increment',
      source: 'web',
      background: 'true',
    });
    assert.equal(parsed.mode, 'increment');
    if (parsed.mode !== 'increment') return;

    assert.equal(parsed.background, null);
    const updates = countedPlayFieldUpdates(
      { source: parsed.source, background: parsed.background },
      'open',
      INCREMENT
    );
    assert.deepEqual(updates, {
      playCount: INCREMENT,
      'playsBySource.web': INCREMENT,
    });
    assert.equal(Object.prototype.hasOwnProperty.call(updates, 'playsBackground'), false);
  });

  it('bumps playsBySource and playsBackground in the same update as playCount', () => {
    const updates = countedPlayFieldUpdates(
      { source: 'android', background: true },
      'counted',
      INCREMENT
    );
    assert.deepEqual(updates, {
      playCount: INCREMENT,
      'playsBySource.android': INCREMENT,
      playsBackground: INCREMENT,
    });
  });

  it('bumps nothing for a rate-limited play', () => {
    assert.equal(
      countedPlayFieldUpdates(
        { source: 'ios', background: true },
        'limited',
        INCREMENT
      ),
      null
    );
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

  it('logs a counted play without an IP, uid, or raw source', () => {
    const line = countedPlayLogLine({
      songId: 'song-1',
      source: null,
      background: null,
      reservation: 'counted',
    });
    assert.equal(
      line,
      'play_counted {"songId":"song-1","source":null,"background":null}'
    );
    assert.equal(line?.includes('uid'), false);
  });
});
