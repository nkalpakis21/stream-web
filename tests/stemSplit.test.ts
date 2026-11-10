import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EXTRACTION_PATH,
  STEM_PRESET_2,
  buildExtractionForm,
  extractionBodySendsStemsOrAudioUrl,
  extractionTextFields,
  instrumentalUrlFromExtraction,
  isMusicGptExtractionEvent,
  musicGptExtractionUrl,
  readStemSplitTask,
  submitStemExtraction,
} from '../lib/server/stemSplit';

describe('stem split', () => {
  it('posts v2 Extraction with stem_preset and an audio file, never stems or audio_url', async () => {
    assert.equal(extractionBodySendsStemsOrAudioUrl(extractionTextFields('https://example.com/hook')), false);
    assert.equal(extractionTextFields(null).stem_preset, STEM_PRESET_2);
    const form = buildExtractionForm(extractionTextFields('https://example.com/hook'), {
      bytes: new Uint8Array([1, 2, 3]),
      contentType: 'audio/mpeg',
      filename: 'song.mp3',
    });
    assert.equal(form.get('stem_preset'), '2_stems');
    assert.equal(form.get('stems'), null);
    assert.equal(form.get('audio_url'), null);
    assert.ok(form.get('audio_file'));
    assert.equal(form.get('webhook_url'), 'https://example.com/hook');
    assert.equal(
      musicGptExtractionUrl('https://api.musicgpt.com/api/public/v1'),
      `https://api.musicgpt.com${EXTRACTION_PATH}`
    );
    assert.match(musicGptExtractionUrl('https://api.musicgpt.com'), /\/api\/public\/v2\/Extraction$/);

    const previousBase = process.env.MUSICGPT_BASE_URL;
    const previousKey = process.env.MUSICGPT_API_KEY;
    process.env.MUSICGPT_BASE_URL = 'https://api.musicgpt.com';
    process.env.MUSICGPT_API_KEY = 'test-key';
    let posted = '';
    let auth = '';
    try {
      const result = await submitStemExtraction(
        { sourceAudioUrl: 'https://cdn1.musicgpt.com/conversions/mix.mp3', webhookUrl: 'https://example.com/hook' },
        {
          async download() {
            return { bytes: new Uint8Array([9]), contentType: 'audio/mpeg', filename: 'song.mp3' };
          },
          fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
            posted = String(url);
            auth = new Headers(init?.headers).get('Authorization') ?? '';
            const body = init?.body as FormData;
            assert.equal(body.get('stem_preset'), '2_stems');
            assert.equal(body.get('stems'), null);
            assert.equal(body.get('audio_url'), null);
            assert.ok(body.get('audio_file'));
            return new Response(
              JSON.stringify({
                success: true,
                task_id: 'task-split',
                conversion_id: 'conv-split',
                credit_estimate: 0,
                is_free_promo: true,
              }),
              { status: 200 }
            );
          }) as typeof fetch,
        }
      );
      assert.equal(posted, 'https://api.musicgpt.com/api/public/v2/Extraction');
      assert.equal(auth, 'test-key');
      assert.equal(result.taskId, 'task-split');
      assert.equal(result.conversionId, 'conv-split');
      assert.equal(result.creditEstimate, 0);
      assert.equal(result.isFreePromo, true);
    } finally {
      if (previousBase === undefined) delete process.env.MUSICGPT_BASE_URL;
      else process.env.MUSICGPT_BASE_URL = previousBase;
      if (previousKey === undefined) delete process.env.MUSICGPT_API_KEY;
      else process.env.MUSICGPT_API_KEY = previousKey;
    }
  });

  it('reads the instrumental URL and a charged estimate', () => {
    const url = instrumentalUrlFromExtraction({
      audio_url:
        '{"vocals":"https://cdn1.musicgpt.com/conversions/v.mp3","instrumental":"https://cdn1.musicgpt.com/conversions/i.mp3"}',
    });
    assert.equal(url, 'https://cdn1.musicgpt.com/conversions/i.mp3');
    assert.equal(instrumentalUrlFromExtraction({ audio_url: '{"instrumental":"https://evil.example/i.mp3"}' }), null);
    assert.equal(isMusicGptExtractionEvent({ conversion_type: 'Extraction' }), true);
    assert.equal(isMusicGptExtractionEvent({ conversion_type: 'MUSIC_AI' }), false);
    const charged = readStemSplitTask({
      task_id: 'task-1',
      conversion_id: 'conv-1',
      credit_estimate: 0.09,
      is_free_promo: false,
    });
    assert.equal(charged.creditEstimate, 0.09);
    assert.equal(charged.isFreePromo, false);
  });
});
