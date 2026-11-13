import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audioUrlFrom, generateVoicesSequentially } from '../scripts/generate-voice-previews';

describe('voice preview script', () => {
  it('reads conversion_path_1 and falls back to conversion_path_2', () => {
    assert.equal(
      audioUrlFrom({
        conversion_path_1: 'https://cdn.example/one.mp3',
        conversion_path_2: 'https://cdn.example/two.mp3',
      }),
      'https://cdn.example/one.mp3'
    );
    assert.equal(
      audioUrlFrom({
        conversion_path_1: '',
        conversion_path_2: 'https://cdn.example/two.mp3',
      }),
      'https://cdn.example/two.mp3'
    );
    assert.equal(
      audioUrlFrom({ conversion_path_2: 'https://cdn.example/two.mp3' }),
      'https://cdn.example/two.mp3'
    );
    assert.equal(audioUrlFrom({ conversion_path_1: 'not-a-url', conversion_path_2: 'https://cdn.example/two.mp3' }), 'https://cdn.example/two.mp3');
    assert.equal(audioUrlFrom({ conversion_path: 'https://cdn.example/legacy.mp3' }), 'https://cdn.example/legacy.mp3');
    assert.equal(audioUrlFrom(undefined), '');
    assert.equal(audioUrlFrom({}), '');
  });

  it('starts the next voice only after the previous one finishes', async () => {
    const started: string[] = [];
    let releaseFirst: () => void = () => {};
    const firstDone = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    const running = generateVoicesSequentially(['calla', 'vesper'], async slug => {
      started.push(slug);
      if (slug === 'calla') await firstDone;
    });
    await Promise.resolve();
    assert.deepEqual(started, ['calla']);
    releaseFirst();
    await running;
    assert.deepEqual(started, ['calla', 'vesper']);
  });
});
