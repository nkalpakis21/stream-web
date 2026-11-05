import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/musicgpt/conversion/[id]/route';
import { setMusicGptConversionRouteDepsForTests } from '../lib/server/musicgptConversionRouteDeps';
import { POST } from '../app/api/generations/musicgpt/route';
import {
  buildMusicGptCreateBody,
  createMusicGPTSong,
  getConversionDataByConversionID,
  MUSICGPT_DEFAULT_MODEL,
  musicGptApiVersion,
  musicGptByIdUrl,
  musicGptCreateUrl,
  musicGptGenerateAlbumCover,
} from '../lib/ai/providers/musicgpt';
import { setMusicGptGenerationDepsForTests } from '../lib/server/musicgptGeneration';
import {
  isMusicGptAudioStreamingEvent,
  musicGptDurationMs,
  resolveMusicGptUsageNumbers,
  safeMusicGptStreamingUrl,
} from '../lib/server/musicgptUsage';

const savedEnv: Record<string, string | undefined> = {};

function rememberEnv(name: string) {
  if (!(name in savedEnv)) savedEnv[name] = process.env[name];
}

function setEnv(name: string, value: string | undefined) {
  rememberEnv(name);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  setEnv('NODE_ENV', 'test');
  setMusicGptConversionRouteDepsForTests(null);
  setMusicGptGenerationDepsForTests(null);
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('MusicGPT v2', { concurrency: false }, () => {
describe('MusicAI path version', () => {
  it('defaults to v2 and accepts only v1 as rollback', () => {
    assert.equal(musicGptApiVersion(undefined), 'v2');
    assert.equal(musicGptApiVersion(''), 'v2');
    assert.equal(musicGptApiVersion('v2'), 'v2');
    assert.equal(musicGptApiVersion('V2'), 'v2');
    assert.equal(musicGptApiVersion('nope'), 'v2');
    assert.equal(musicGptApiVersion('v1'), 'v1');
    assert.equal(musicGptApiVersion(' V1 '), 'v1');
  });

  it('builds /api/public/v2/MusicAI even when the base URL already embeds /v1', () => {
    assert.equal(
      musicGptCreateUrl('https://api.musicgpt.com', 'v2'),
      'https://api.musicgpt.com/api/public/v2/MusicAI'
    );
    assert.equal(
      musicGptCreateUrl('https://api.musicgpt.com/api/public/v1', 'v2'),
      'https://api.musicgpt.com/api/public/v2/MusicAI'
    );
    assert.equal(
      musicGptCreateUrl('https://api.musicgpt.com/api/public/v1/', 'v2'),
      'https://api.musicgpt.com/api/public/v2/MusicAI'
    );
    assert.equal(
      musicGptCreateUrl('https://api.musicgpt.com/api/public/v1/MusicAI', 'v2'),
      'https://api.musicgpt.com/api/public/v2/MusicAI'
    );
    assert.equal(
      musicGptCreateUrl('https://api.musicgpt.com/api/public/v2', 'v1'),
      'https://api.musicgpt.com/api/public/v1/MusicAI'
    );
  });

  it('keeps byId on /v1', () => {
    assert.equal(
      musicGptByIdUrl('https://api.musicgpt.com'),
      'https://api.musicgpt.com/api/public/v1/byId'
    );
    assert.equal(
      musicGptByIdUrl('https://api.musicgpt.com/api/public/v2'),
      'https://api.musicgpt.com/api/public/v1/byId'
    );
    assert.equal(
      musicGptByIdUrl('https://api.musicgpt.com/api/public/v2/MusicAI'),
      'https://api.musicgpt.com/api/public/v1/byId'
    );
  });
});

describe('MusicAI create body', () => {
  it('sends v6, lyric timestamps, and no num_outputs on v2', () => {
    setEnv('COVER_PIPELINE', undefined);
    setEnv('MUSICGPT_API_VERSION', undefined);
    const body = buildMusicGptCreateBody({
      prompt: 'a song',
      lyrics: 'la la',
      music_style: 'pop',
      make_instrumental: false,
      webhook_url: 'https://example.test/hook',
      title: 'Night Bus',
    });
    assert.equal(body.prompt, 'a song');
    assert.equal(body.lyrics, 'la la');
    assert.equal(body.music_style, 'pop');
    assert.equal(body.make_instrumental, false);
    assert.equal(body.webhook_url, 'https://example.test/hook');
    assert.equal(body.title, 'Night Bus');
    assert.equal(body.lyrics_timestamps, true);
    assert.equal(body.model, MUSICGPT_DEFAULT_MODEL);
    assert.equal(body.model, 'v6');
    assert.equal(body.generate_album_cover, true);
    assert.equal('num_outputs' in body, false);
    assert.equal(musicGptGenerateAlbumCover(), true);
  });

  it('sets generate_album_cover false when covers come from Fal', () => {
    setEnv('COVER_PIPELINE', 'fal');
    assert.equal(buildMusicGptCreateBody({ prompt: 'a song' }).generate_album_cover, false);
    setEnv('COVER_PIPELINE', 'FAL');
    assert.equal(musicGptGenerateAlbumCover(), false);
    assert.equal(buildMusicGptCreateBody({ prompt: 'a song' }).generate_album_cover, false);
  });

  it('omits v2-only fields on the v1 rollback path', () => {
    setEnv('COVER_PIPELINE', undefined);
    const body = buildMusicGptCreateBody(
      { prompt: 'a song', title: 'Night Bus' },
      { version: 'v1' }
    );
    assert.equal(body.prompt, 'a song');
    assert.equal(body.title, 'Night Bus');
    assert.equal(body.generate_album_cover, true);
    assert.equal('lyrics_timestamps' in body, false);
    assert.equal('model' in body, false);
    assert.equal('num_outputs' in body, false);
  });
});

describe('MusicAI HTTP calls', { concurrency: false }, () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('POSTs v2 with the same Authorization key when the base URL embeds v1', async () => {
    setEnv('MUSICGPT_BASE_URL', 'https://api.musicgpt.com/api/public/v1');
    setEnv('MUSICGPT_API_KEY', 'test-musicgpt-key');
    setEnv('MUSICGPT_API_VERSION', undefined);
    setEnv('COVER_PIPELINE', 'fal');

    const seen: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      seen.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({ success: true, task_id: 'task-1', credit_estimate: 0.035 }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;

    const result = await createMusicGPTSong({
      prompt: 'a song',
      lyrics: 'la la',
      music_style: 'pop',
      make_instrumental: false,
      webhook_url: 'https://example.test/api/webhooks/musicgpt?token=s3cret',
      title: 'Night Bus',
    });

    assert.equal(result.task_id, 'task-1');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, 'https://api.musicgpt.com/api/public/v2/MusicAI');
    const headers = new Headers(seen[0].init.headers);
    assert.equal(headers.get('authorization'), 'test-musicgpt-key');
    const body = JSON.parse(String(seen[0].init.body)) as Record<string, unknown>;
    assert.equal(body.lyrics_timestamps, true);
    assert.equal(body.model, 'v6');
    assert.equal(body.generate_album_cover, false);
    assert.equal(body.title, 'Night Bus');
    assert.equal('num_outputs' in body, false);
  });

  it('rolls create back to v1 without changing the key', async () => {
    setEnv('MUSICGPT_BASE_URL', 'https://api.musicgpt.com/api/public/v2');
    setEnv('MUSICGPT_API_KEY', 'test-musicgpt-key');
    setEnv('MUSICGPT_API_VERSION', 'v1');
    setEnv('COVER_PIPELINE', undefined);

    let url = '';
    let auth = '';
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      url = String(input);
      auth = new Headers(init?.headers).get('authorization') ?? '';
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true, task_id: 'task-v1' }), { status: 200 });
    }) as typeof fetch;

    await createMusicGPTSong({ prompt: 'a song' });
    assert.equal(url, 'https://api.musicgpt.com/api/public/v1/MusicAI');
    assert.equal(auth, 'test-musicgpt-key');
    assert.equal('model' in body, false);
    assert.equal('lyrics_timestamps' in body, false);
    assert.equal(body.generate_album_cover, true);
  });

  it('loads byId from v1 while create is on v2', async () => {
    setEnv('MUSICGPT_BASE_URL', 'https://api.musicgpt.com/api/public/v2/MusicAI');
    setEnv('MUSICGPT_API_KEY', 'test-musicgpt-key');
    setEnv('MUSICGPT_API_VERSION', 'v2');

    let url = '';
    let auth = '';
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      url = String(input);
      auth = new Headers(init?.headers).get('authorization') ?? '';
      return new Response(JSON.stringify({ success: true, conversion: { id: 'conv-1' } }), {
        status: 200,
      });
    }) as typeof fetch;

    const result = await getConversionDataByConversionID('conv-1');
    assert.equal(result?.success, true);
    assert.equal(auth, 'test-musicgpt-key');
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, 'https://api.musicgpt.com/api/public/v1/byId');
    assert.equal(parsed.searchParams.get('conversion_id'), 'conv-1');
    assert.equal(parsed.searchParams.get('conversionType'), 'MUSIC_AI');
  });
});

describe('MusicGPT usage numbers', () => {
  it('keeps the estimate and a separate charged cost', () => {
    const observed = resolveMusicGptUsageNumbers({
      webhook: { cost: 0.04 },
      conversion: { credit_estimate: 0.05 },
      metadata: { credit_estimate: 0.02 },
      bindingCreditEstimate: 0.035,
      bindingModel: 'v6',
      bindingApiVersion: 'v2',
    });
    assert.equal(observed.creditEstimate, 0.05);
    assert.equal(observed.chargedCost, 0.04);
    assert.equal(observed.model, 'v6');
    assert.equal(observed.apiVersion, 'v2');
    assert.equal(musicGptDurationMs(1_000, 4_500), 3_500);
    assert.equal(musicGptDurationMs(null, 4_500), null);
    assert.equal(musicGptDurationMs(5_000, 4_500), null);
  });

  it('falls back to the create-time estimate on the task binding', () => {
    const observed = resolveMusicGptUsageNumbers({
      webhook: {},
      conversion: null,
      metadata: {},
      bindingCreditEstimate: 0.035,
      bindingModel: 'v6',
      bindingApiVersion: 'v2',
    });
    assert.equal(observed.creditEstimate, 0.035);
    assert.equal(observed.chargedCost, null);
  });

  it('treats streaming payloads as non-completion and strips URL secrets', () => {
    assert.equal(
      isMusicGptAudioStreamingEvent({
        subtype: 'audio_streaming',
        streaming_url: 'https://cdn.example/a.m3u8',
      }),
      true
    );
    assert.equal(
      isMusicGptAudioStreamingEvent({
        subtype: 'Audio-Streaming',
        conversion_path: 'https://cdn.example/final.mp3',
        streaming_url: 'https://cdn.example/a.m3u8',
      }),
      false
    );
    assert.equal(
      isMusicGptAudioStreamingEvent({ streaming_url: 'https://cdn.example/a.m3u8' }),
      true
    );
    assert.equal(
      safeMusicGptStreamingUrl('https://user:secret@cdn.example/streams/other.m3u8'),
      'https://cdn.example/streams/other.m3u8'
    );
    assert.equal(safeMusicGptStreamingUrl('http://cdn.example/a.m3u8'), null);
    assert.equal(safeMusicGptStreamingUrl('javascript:alert(1)'), null);
  });
});

describe('POST /api/generations/musicgpt cost binding', { concurrency: false }, () => {
  it('stores credit_estimate, model v6, and api version on the task binding', async () => {
    setEnv('WEBHOOK_BASE_URL', 'https://configured.example');
    setEnv('MUSICGPT_WEBHOOK_SECRET', 'webhook-secret');
    setEnv('MUSICGPT_API_VERSION', 'v2');
    const saved: Array<Record<string, unknown>> = [];
    setMusicGptGenerationDepsForTests({
      verifyToken: async () => ({ uid: 'victim' }),
      createMusic: async () => ({
        task_id: 'task-cost',
        conversion_id_1: 'c1',
        credit_estimate: 0.035,
      }),
      saveTaskBinding: async (input) => {
        saved.push({ ...input });
      },
    });

    const response = await POST(
      new NextRequest('https://configured.example/api/generations/musicgpt', {
        method: 'POST',
        headers: {
          authorization: 'Bearer good-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prompt: 'a song' }),
      })
    );

    assert.equal(response.status, 200);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].creditEstimate, 0.035);
    assert.equal(saved[0].model, 'v6');
    assert.equal(saved[0].apiVersion, 'v2');
    assert.equal('num_outputs' in saved[0], false);
  });
});

describe('GET /api/musicgpt/conversion/[id]', { concurrency: false }, () => {
  function call(id = 'conv-1') {
    return GET(new NextRequest(`https://example.test/api/musicgpt/conversion/${id}`), {
      params: { id },
    });
  }

  function callAs(uid: string | null, id = 'conv-1') {
    return GET(
      new NextRequest(`https://example.test/api/musicgpt/conversion/${id}`, {
        headers: uid ? { authorization: 'Bearer good-token' } : {},
      }),
      { params: { id } }
    );
  }

  it('is not callable when Node is production', async () => {
    setEnv('NODE_ENV', 'test');
    setEnv('VERCEL_ENV', 'preview');
    let calls = 0;
    setMusicGptConversionRouteDepsForTests({
      verifyToken: async () => ({ uid: 'admin-1' }),
      getConversion: async () => {
        calls += 1;
        return { success: true, conversion: { id: 'conv-1' } };
      },
    });
    setEnv('NODE_ENV', 'production');

    const response = await call();
    assert.equal(response.status, 404);
    assert.equal(calls, 0);
  });

  it('is not callable when VERCEL_ENV is production', async () => {
    setEnv('NODE_ENV', 'test');
    setEnv('VERCEL_ENV', 'production');
    setEnv('ADMIN_UIDS', 'admin-1');
    let calls = 0;
    setMusicGptConversionRouteDepsForTests({
      verifyToken: async () => ({ uid: 'admin-1' }),
      getConversion: async () => {
        calls += 1;
        return { success: true, conversion: {} };
      },
    });

    const response = await callAs('admin-1');
    assert.equal(response.status, 404);
    assert.equal(calls, 0);
  });

  it('rejects anonymous and non-admin callers outside production', async () => {
    setEnv('NODE_ENV', 'test');
    setEnv('VERCEL_ENV', undefined);
    setEnv('ADMIN_UIDS', 'admin-1');
    let calls = 0;
    setMusicGptConversionRouteDepsForTests({
      verifyToken: async () => ({ uid: 'someone-else' }),
      getConversion: async () => {
        calls += 1;
        return { success: true, conversion: {} };
      },
    });

    const anonymous = await call();
    assert.equal(anonymous.status, 404);
    const stranger = await callAs('someone-else');
    assert.equal(stranger.status, 404);
    assert.equal(calls, 0);
  });

  it('allows an ADMIN_UIDS caller outside production', async () => {
    setEnv('NODE_ENV', 'test');
    setEnv('VERCEL_ENV', undefined);
    setEnv('ADMIN_UIDS', 'admin-1,admin-2');
    setMusicGptConversionRouteDepsForTests({
      verifyToken: async () => ({ uid: 'admin-2' }),
      getConversion: async (id) => {
        assert.equal(id, 'conv-9');
        return { success: true, conversion: { conversion_path: 'https://cdn.example/a.mp3' } };
      },
    });

    const response = await callAs('admin-2', 'conv-9');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.conversion.conversion_path, 'https://cdn.example/a.mp3');
  });
});
});
