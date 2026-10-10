import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import { describe, it } from 'node:test';
import {
  PLAY_IP_MAX_PER_WINDOW,
  PLAY_IP_WINDOW_MS,
  PLAY_SONG_MAX_PER_WINDOW,
  PLAY_SONG_WINDOW_MS,
  evaluatePlayLimit,
  playListenerKey,
} from '../lib/server/playRateLimit';

describe('play rate limit', () => {
  it('keys the listener with HMAC-SHA256 of the IP only', () => {
    const ip = '203.0.113.10';
    const key = playListenerKey(ip, 'server-secret');
    const plain = createHash('sha256').update(ip).digest('hex');
    assert.equal(key.length, 64);
    assert.notEqual(key, plain);
    assert.equal(playListenerKey(ip, 'server-secret'), key);
    assert.notEqual(playListenerKey(ip, 'other-secret'), key);
    assert.notEqual(playListenerKey('198.51.100.4', 'server-secret'), key);
  });

  it('allows 5 counted plays per song per 30 seconds', () => {
    const now = 1_000_000;
    let songStart: number | null = null;
    let songCount = 0;
    for (let n = 0; n < PLAY_SONG_MAX_PER_WINDOW; n += 1) {
      const decision = evaluatePlayLimit({
        nowMs: now + n,
        songWindowStartMs: songStart,
        songCount,
        ipWindowStartMs: now,
        ipCount: n,
      });
      assert.equal(decision.allowed, true);
      songStart = decision.nextSongWindowStartMs;
      songCount = decision.nextSongCount;
    }
    assert.equal(songCount, PLAY_SONG_MAX_PER_WINDOW);

    const blocked = evaluatePlayLimit({
      nowMs: now + PLAY_SONG_WINDOW_MS - 1,
      songWindowStartMs: songStart,
      songCount,
      ipWindowStartMs: now,
      ipCount: songCount,
    });
    assert.equal(blocked.allowed, false);

    const reset = evaluatePlayLimit({
      nowMs: now + PLAY_SONG_WINDOW_MS,
      songWindowStartMs: songStart,
      songCount,
      ipWindowStartMs: now,
      ipCount: songCount,
    });
    assert.equal(reset.allowed, true);
    assert.equal(reset.nextSongCount, 1);
  });

  it('caps an IP at 300 counted plays per minute across songs', () => {
    const now = 5_000_000;
    const blocked = evaluatePlayLimit({
      nowMs: now,
      songWindowStartMs: null,
      songCount: 0,
      ipWindowStartMs: now - 1_000,
      ipCount: PLAY_IP_MAX_PER_WINDOW,
    });
    assert.equal(blocked.allowed, false);

    const reset = evaluatePlayLimit({
      nowMs: now,
      songWindowStartMs: null,
      songCount: 0,
      ipWindowStartMs: now - PLAY_IP_WINDOW_MS,
      ipCount: PLAY_IP_MAX_PER_WINDOW,
    });
    assert.equal(reset.allowed, true);
    assert.equal(reset.nextIpCount, 1);
    assert.equal(PLAY_IP_MAX_PER_WINDOW, 300);
    assert.equal(PLAY_SONG_MAX_PER_WINDOW, 5);
  });
});
