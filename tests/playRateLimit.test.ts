import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import { describe, it } from 'node:test';
import {
  PLAY_CLIENT_MAX_PER_WINDOW,
  PLAY_CLIENT_WINDOW_MS,
  PLAY_SONG_INTERVAL_MS,
  evaluatePlayLimit,
  playListenerKey,
} from '../lib/server/playRateLimit';

describe('play rate limit', () => {
  it('keys the listener with HMAC-SHA256, not a plain hash of the IP', () => {
    const ip = '203.0.113.10';
    const key = playListenerKey(ip, 'device-1', 'server-secret');
    const plain = createHash('sha256').update(ip).digest('hex');
    assert.equal(key.length, 64);
    assert.notEqual(key, plain);
    assert.notEqual(
      playListenerKey(ip, 'device-1', 'server-secret'),
      playListenerKey(ip, 'device-2', 'server-secret')
    );
    assert.equal(
      playListenerKey(ip, null, 'server-secret'),
      playListenerKey(ip, null, 'server-secret')
    );
  });

  it('allows one play per song per 30 seconds', () => {
    const now = 1_000_000;
    const first = evaluatePlayLimit({
      nowMs: now,
      songLastCountedAtMs: null,
      clientWindowStartMs: null,
      clientCount: 0,
    });
    assert.equal(first.allowed, true);

    const tooSoon = evaluatePlayLimit({
      nowMs: now + PLAY_SONG_INTERVAL_MS - 1,
      songLastCountedAtMs: now,
      clientWindowStartMs: now,
      clientCount: 1,
    });
    assert.equal(tooSoon.allowed, false);

    const later = evaluatePlayLimit({
      nowMs: now + PLAY_SONG_INTERVAL_MS,
      songLastCountedAtMs: now,
      clientWindowStartMs: now,
      clientCount: 1,
    });
    assert.equal(later.allowed, true);
  });

  it('caps a listener at 20 counted plays per minute', () => {
    const now = 5_000_000;
    const blocked = evaluatePlayLimit({
      nowMs: now,
      songLastCountedAtMs: null,
      clientWindowStartMs: now - 1_000,
      clientCount: PLAY_CLIENT_MAX_PER_WINDOW,
    });
    assert.equal(blocked.allowed, false);

    const reset = evaluatePlayLimit({
      nowMs: now,
      songLastCountedAtMs: null,
      clientWindowStartMs: now - PLAY_CLIENT_WINDOW_MS,
      clientCount: PLAY_CLIENT_MAX_PER_WINDOW,
    });
    assert.equal(reset.allowed, true);
    assert.equal(reset.nextCount, 1);
  });
});
