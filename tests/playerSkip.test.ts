import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { advanceToPlayable } from '../lib/player/skipQueue';
import { audioUrlForPlayback, type AudioVersionRef } from '../lib/songs/audioAvailability';

interface Track {
  id: string;
  versions: AudioVersionRef[];
}

function resolve(track: Track): Promise<string | null> {
  return Promise.resolve(audioUrlForPlayback(track.versions));
}

describe('player queue skip', () => {
  const expired: AudioVersionRef = { isPrimary: true, audioURL: 'https://dead', audioExpired: true };
  const live: AudioVersionRef = { isPrimary: true, audioURL: 'https://live', audioExpired: false };

  it('advances past expired tracks to the next playable one', async () => {
    const queue: Track[] = [
      { id: 'a', versions: [expired] },
      { id: 'b', versions: [{ ...expired, audioURL: 'https://dead-2' }] },
      {
        id: 'c',
        versions: [
          { isPrimary: true, audioURL: 'https://dead-3', audioExpired: true },
          { isPrimary: false, audioURL: 'https://live-alt' },
        ],
      },
    ];
    const landed = await advanceToPlayable(queue, 0, 1, resolve);
    assert.deepEqual(landed, { index: 2, audioUrl: 'https://live-alt' });
  });

  it('walks backward past expired tracks', async () => {
    const queue: Track[] = [
      { id: 'live', versions: [live] },
      { id: 'gone', versions: [expired] },
      { id: 'also-gone', versions: [expired] },
    ];
    const landed = await advanceToPlayable(queue, 2, -1, resolve);
    assert.deepEqual(landed, { index: 0, audioUrl: 'https://live' });
  });

  it('resolves to null instead of throwing when nothing left can play', async () => {
    const queue: Track[] = [
      { id: 'a', versions: [expired] },
      { id: 'b', versions: [expired] },
    ];
    const landed = await advanceToPlayable(queue, 0, 1, resolve);
    assert.equal(landed, null);
  });

  it('does not start a direct URL once versions say the file expired', async () => {
    const queue = [{ audioUrl: 'https://dead', versions: [expired] }];
    const landed = await advanceToPlayable(queue, 0, 1, async item =>
      audioUrlForPlayback(item.versions, item.audioUrl)
    );
    assert.equal(landed, null);
  });

  it('is what the player uses when a file fails or is expired', () => {
    const provider = readFileSync('components/songs/SongPlayerProvider.tsx', 'utf8');
    const listen = readFileSync('components/player/ListenPlayer.tsx', 'utf8');
    assert.match(provider, /advanceToPlayable/);
    assert.match(provider, /audioUrlForPlayback/);
    assert.match(provider, /onPlaybackError=\{skipFailed\}/);
    assert.match(listen, /addEventListener\('error', handleError\)/);
  });
});
