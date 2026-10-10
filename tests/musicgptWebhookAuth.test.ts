import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { musicGptWebhookUrl } from '../lib/webhooks/baseUrl';
import {
  musicGptWebhookTokenFromRequest,
  webhookTokensMatch,
} from '../lib/webhooks/musicgptAuth';

describe('MusicGPT webhook token', () => {
  it('rejects a missing or mismatched token', () => {
    assert.equal(webhookTokensMatch(null, 'secret'), false);
    assert.equal(webhookTokensMatch('secret', null), false);
    assert.equal(webhookTokensMatch('nope', 'secret'), false);
    assert.equal(webhookTokensMatch('secret-extra', 'secret'), false);
  });

  it('accepts the exact shared secret', () => {
    assert.equal(webhookTokensMatch('secret-value', 'secret-value'), true);
  });

  it('puts the secret on the callback URL and not in the logged path', () => {
    const url = musicGptWebhookUrl('https://www.streamstar.xyz', 's3cret/with space');
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, 'https://www.streamstar.xyz/api/webhooks/musicgpt');
    assert.equal(parsed.searchParams.get('token'), 's3cret/with space');
    assert.equal(musicGptWebhookUrl('https://www.streamstar.xyz', '   '), 'https://www.streamstar.xyz/api/webhooks/musicgpt');
  });

  it('reads the token from the query string or the header', () => {
    const fromQuery = musicGptWebhookTokenFromRequest({
      url: 'https://www.streamstar.xyz/api/webhooks/musicgpt?token=abc',
      headers: { get: () => null },
    });
    assert.equal(fromQuery, 'abc');

    const fromHeader = musicGptWebhookTokenFromRequest({
      url: 'https://www.streamstar.xyz/api/webhooks/musicgpt',
      headers: {
        get: (name: string) => (name === 'x-musicgpt-webhook-token' ? 'header-secret' : null),
      },
    });
    assert.equal(fromHeader, 'header-secret');
  });
});
