import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/generations/musicgpt/route';
import {
  musicGptGenerationCallback,
  musicGptWebhookUrl,
  resolveWebhookBaseUrl,
} from '../lib/webhooks/baseUrl';
import { revalidateHomepage } from '../lib/webhooks/revalidate';

const CALLBACK_SECRET = 'generation-callback-token';
const REVALIDATE_SECRET = 'revalidate-header-secret';

describe('missing webhook base URL', () => {
  it('does not build a callback URL or include the token', () => {
    assert.equal(resolveWebhookBaseUrl(''), null);
    assert.equal(resolveWebhookBaseUrl('   '), null);
    assert.equal(resolveWebhookBaseUrl('streamstar.xyz'), null);
    assert.equal(resolveWebhookBaseUrl('https://configured.example'), 'https://configured.example');
    assert.equal(musicGptWebhookUrl(null, CALLBACK_SECRET), null);
    assert.equal(musicGptWebhookUrl('', CALLBACK_SECRET), null);
    assert.equal(musicGptWebhookUrl('not a url', CALLBACK_SECRET), null);

    const warnings: string[] = [];
    const callback = musicGptGenerationCallback({
      baseUrl: null,
      secret: CALLBACK_SECRET,
      warn: (message) => warnings.push(message),
    });
    assert.equal(callback.ok, false);
    if (!callback.ok) {
      assert.equal(callback.status, 503);
      assert.equal(
        callback.error,
        'Song generation is unavailable on this deployment: WEBHOOK_BASE_URL is not configured, so MusicGPT has no callback URL.'
      );
    }
    assert.deepEqual(warnings, ['webhook_base_url_missing']);
    const dumped = JSON.stringify({ callback, warnings });
    assert.equal(dumped.includes(CALLBACK_SECRET), false);
    assert.equal(dumped.includes('streamstar.xyz'), false);
  });

  it('returns 503 from the generation route and does not send the token', async () => {
    const previousBase = process.env.WEBHOOK_BASE_URL;
    const previousSecret = process.env.MUSICGPT_WEBHOOK_SECRET;
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };
    delete process.env.WEBHOOK_BASE_URL;
    process.env.MUSICGPT_WEBHOOK_SECRET = CALLBACK_SECRET;

    try {
      const response = await POST(
        new NextRequest('https://evil.example/api/generations/musicgpt', {
          method: 'POST',
          headers: { host: 'evil.example', 'x-forwarded-host': 'evil.example' },
          body: JSON.stringify({ prompt: 'a song' }),
        })
      );
      const body = await response.text();
      assert.equal(response.status, 503);
      assert.match(
        body,
        /Song generation is unavailable on this deployment: WEBHOOK_BASE_URL is not configured, so MusicGPT has no callback URL\./
      );
      assert.equal(body.includes(CALLBACK_SECRET), false);
      assert.equal(body.includes('token='), false);
      assert.deepEqual(warnings, ['webhook_base_url_missing']);
      assert.equal(warnings.join('\n').includes(CALLBACK_SECRET), false);
    } finally {
      console.warn = originalWarn;
      if (previousBase === undefined) delete process.env.WEBHOOK_BASE_URL;
      else process.env.WEBHOOK_BASE_URL = previousBase;
      if (previousSecret === undefined) delete process.env.MUSICGPT_WEBHOOK_SECRET;
      else process.env.MUSICGPT_WEBHOOK_SECRET = previousSecret;
    }
  });
});

describe('missing revalidate base URL', () => {
  it('skips the call and does not send the secret', async () => {
    const warnings: string[] = [];
    const calls: string[] = [];
    const called = await revalidateHomepage({
      appUrl: null,
      secret: REVALIDATE_SECRET,
      warn: (message) => warnings.push(message),
      fetchImpl: async (url, init) => {
        calls.push(url);
        calls.push(new Headers(init?.headers).get('x-revalidate-secret') ?? '');
      },
    });

    assert.equal(called, false);
    assert.deepEqual(calls, []);
    assert.deepEqual(warnings, ['revalidate_base_url_missing']);
    assert.equal(warnings.join('').includes(REVALIDATE_SECRET), false);
    assert.equal(JSON.stringify(warnings).includes('streamstar.xyz'), false);
  });

  it('skips when NEXT_PUBLIC_APP_URL is unset', async () => {
    const previous = process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const calls: string[] = [];
    const warnings: string[] = [];
    try {
      const called = await revalidateHomepage({
        secret: REVALIDATE_SECRET,
        warn: (message) => warnings.push(message),
        fetchImpl: async (url) => {
          calls.push(url);
        },
      });
      assert.equal(called, false);
      assert.deepEqual(calls, []);
      assert.deepEqual(warnings, ['revalidate_base_url_missing']);
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = previous;
    }
  });

  it('posts only to the configured base URL', async () => {
    let seen = '';
    let header = '';
    const called = await revalidateHomepage({
      appUrl: 'https://preview.example.com/',
      secret: REVALIDATE_SECRET,
      fetchImpl: async (url, init) => {
        seen = url;
        header = new Headers(init?.headers).get('x-revalidate-secret') ?? '';
      },
    });
    assert.equal(called, true);
    assert.equal(seen, 'https://preview.example.com/api/revalidate');
    assert.equal(header, REVALIDATE_SECRET);
    assert.equal(seen.includes('streamstar.xyz'), false);
  });
});
