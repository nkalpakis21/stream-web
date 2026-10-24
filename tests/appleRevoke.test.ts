import assert from 'node:assert/strict';
import { generateKeyPairSync, verify, type KeyObject } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  appleAuthorizationCodeFromBody,
  hasAppleProvider,
  revokeAppleOnAccountDeletion,
} from '../lib/server/appleRevoke';

const TEAM_ID = 'TEAMID1234';
const KEY_ID = 'KEYID123456';
const CLIENT_ID = 'com.example.streamstar';
const AUTH_CODE = 'auth-code+with/special=';
const REFRESH_TOKEN = 'refresh-token-value';
const ACCESS_TOKEN = 'access-token-should-not-leak';
const NOW = 1_700_000_000;
const CLIENT_SECRET_TTL_SECONDS = 10 * 60;

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const PRIVATE_KEY_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

function escapedPrivateKey(pem: string = PRIVATE_KEY_PEM): string {
  return `"${pem.trim().replace(/\n/g, '\\n')}"`;
}

function appleEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    APPLE_TEAM_ID: TEAM_ID,
    APPLE_SIWA_KEY_ID: KEY_ID,
    APPLE_SIWA_PRIVATE_KEY: escapedPrivateKey(),
    APPLE_SIWA_CLIENT_ID: CLIENT_ID,
    ...overrides,
  };
}

type RecordedCall = {
  url: string;
  method: string;
  redirect: string | undefined;
  contentType: string | null;
  params: URLSearchParams;
};

function recordedFetch(handler: (call: RecordedCall) => Response): {
  calls: RecordedCall[];
  fetchImpl: typeof fetch;
} {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const params = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
    const call: RecordedCall = {
      url: String(input),
      method: init?.method ?? 'GET',
      redirect: init?.redirect,
      contentType: new Headers(init?.headers).get('content-type'),
      params,
    };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function decodePart(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
}

function assertClientSecret(jwt: string, key: KeyObject): void {
  const parts = jwt.split('.');
  assert.equal(parts.length, 3);
  assert.deepEqual(decodePart(parts[0]), { alg: 'ES256', kid: KEY_ID });
  const payload = decodePart(parts[1]);
  assert.equal(payload.iss, TEAM_ID);
  assert.equal(payload.sub, CLIENT_ID);
  assert.equal(payload.aud, 'https://appleid.apple.com');
  assert.equal(payload.iat, NOW);
  assert.equal(payload.exp, NOW + CLIENT_SECRET_TTL_SECONDS);
  const signature = Buffer.from(parts[2], 'base64url');
  assert.equal(signature.length, 64);
  assert.equal(
    verify(
      'SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      { key, dsaEncoding: 'ieee-p1363' },
      signature
    ),
    true
  );
  const keyLine = PRIVATE_KEY_PEM.split('\n').find(line => !line.startsWith('-----') && line.length > 20);
  assert.ok(keyLine);
  assert.equal(jwt.includes('BEGIN PRIVATE KEY'), false);
  assert.equal(jwt.includes(keyLine), false);
}

function assertNoSecrets(text: string, extra: string[] = []): void {
  const secrets = [PRIVATE_KEY_PEM, escapedPrivateKey(), AUTH_CODE, REFRESH_TOKEN, ACCESS_TOKEN, ...extra];
  for (const secret of secrets) {
    assert.equal(text.includes(secret), false, 'log or response leaked a secret');
  }
}

describe('apple provider detection', () => {
  it('treats the apple.com sign-in provider and linked identity as Apple', () => {
    assert.equal(hasAppleProvider({ signInProvider: 'apple.com' }), true);
    assert.equal(
      hasAppleProvider({
        signInProvider: 'password',
        identities: { 'apple.com': ['000123.apple-user'] },
      }),
      true
    );
  });

  it('ignores users without the apple.com provider', () => {
    assert.equal(hasAppleProvider({ signInProvider: 'google.com' }), false);
    assert.equal(
      hasAppleProvider({
        signInProvider: 'password',
        identities: { 'google.com': ['g-1'], 'apple.com': [] },
      }),
      false
    );
    assert.equal(hasAppleProvider({ signInProvider: 'apple.com.fake', identities: null }), false);
    assert.equal(hasAppleProvider({ identities: ['apple.com'] }), false);
  });
});

describe('apple authorization code body', () => {
  it('reads a trimmed code and ignores everything else', () => {
    assert.equal(appleAuthorizationCodeFromBody(''), null);
    assert.equal(appleAuthorizationCodeFromBody('   '), null);
    assert.equal(appleAuthorizationCodeFromBody('not-json'), null);
    assert.equal(appleAuthorizationCodeFromBody('[]'), null);
    assert.equal(appleAuthorizationCodeFromBody('{"appleAuthorizationCode":""}'), null);
    assert.equal(appleAuthorizationCodeFromBody('{"appleAuthorizationCode":"  "}'), null);
    assert.equal(appleAuthorizationCodeFromBody('{"appleAuthorizationCode":1}'), null);
    assert.equal(
      appleAuthorizationCodeFromBody(`{"other":true,"appleAuthorizationCode":"  ${AUTH_CODE}  "}`),
      AUTH_CODE
    );
  });
});

describe('revoke Sign in with Apple on account deletion', () => {
  it('exchanges the code and revokes the refresh token', async () => {
    const warnings: string[] = [];
    const { calls, fetchImpl } = recordedFetch(call => {
      if (call.url === 'https://appleid.apple.com/auth/token') {
        return Response.json({
          refresh_token: REFRESH_TOKEN,
          access_token: ACCESS_TOKEN,
          id_token: 'id-token-should-not-leak',
        });
      }
      assert.equal(call.url, 'https://appleid.apple.com/auth/revoke');
      return new Response(null, { status: 200 });
    });

    const result = await revokeAppleOnAccountDeletion({
      appleLinked: true,
      authorizationCode: `  ${AUTH_CODE}  `,
      env: appleEnv(),
      fetchImpl,
      nowSeconds: NOW,
      warn: (event, reason) => warnings.push(`${event} ${reason}`),
    });

    assert.equal(result, 'revoked');
    assert.deepEqual(warnings, []);
    assert.equal(calls.length, 2);

    const [tokenCall, revokeCall] = calls;
    assert.equal(tokenCall.url, 'https://appleid.apple.com/auth/token');
    assert.equal(tokenCall.method, 'POST');
    assert.equal(tokenCall.redirect, 'manual');
    assert.equal(tokenCall.contentType, 'application/x-www-form-urlencoded');
    assert.equal(tokenCall.params.get('client_id'), CLIENT_ID);
    assert.equal(tokenCall.params.get('code'), AUTH_CODE);
    assert.equal(tokenCall.params.get('grant_type'), 'authorization_code');
    assert.equal(tokenCall.params.get('token'), null);
    const clientSecret = tokenCall.params.get('client_secret');
    assert.ok(clientSecret);
    assertClientSecret(clientSecret, publicKey);

    assert.equal(revokeCall.url, 'https://appleid.apple.com/auth/revoke');
    assert.equal(revokeCall.method, 'POST');
    assert.equal(revokeCall.redirect, 'manual');
    assert.equal(revokeCall.contentType, 'application/x-www-form-urlencoded');
    assert.equal(revokeCall.params.get('client_id'), CLIENT_ID);
    assert.equal(revokeCall.params.get('client_secret'), clientSecret);
    assert.equal(revokeCall.params.get('token'), REFRESH_TOKEN);
    assert.equal(revokeCall.params.get('token_type_hint'), 'refresh_token');
    assert.equal(revokeCall.params.get('code'), null);
    assert.notEqual(revokeCall.params.get('token'), ACCESS_TOKEN);
    assertNoSecrets(warnings.join('\n'), [clientSecret, 'id-token-should-not-leak']);
  });

  it('accepts a PKCS8 key that already contains newlines', async () => {
    const warnings: string[] = [];
    const { calls, fetchImpl } = recordedFetch(call => {
      if (call.url === 'https://appleid.apple.com/auth/token') {
        return Response.json({ refresh_token: REFRESH_TOKEN });
      }
      return new Response(null, { status: 200 });
    });
    const result = await revokeAppleOnAccountDeletion({
      appleLinked: true,
      authorizationCode: AUTH_CODE,
      env: appleEnv({ APPLE_SIWA_PRIVATE_KEY: PRIVATE_KEY_PEM }),
      fetchImpl,
      nowSeconds: NOW,
      warn: (event, reason) => warnings.push(`${event} ${reason}`),
    });
    assert.equal(result, 'revoked');
    assert.deepEqual(warnings, []);
    const clientSecret = calls[0]?.params.get('client_secret');
    assert.ok(clientSecret);
    assertClientSecret(clientSecret, publicKey);
  });

  it('does nothing for a user without the apple.com provider', async () => {
    let fetched = false;
    const warnings: string[] = [];
    const result = await revokeAppleOnAccountDeletion({
      appleLinked: false,
      authorizationCode: AUTH_CODE,
      env: appleEnv(),
      fetchImpl: (async () => {
        fetched = true;
        return new Response(null, { status: 500 });
      }) as typeof fetch,
      warn: (event, reason) => warnings.push(`${event} ${reason}`),
    });
    assert.equal(result, null);
    assert.equal(fetched, false);
    assert.deepEqual(warnings, []);
  });

  it('skips when the authorization code was not sent', async () => {
    let fetched = false;
    const warnings: string[] = [];
    const result = await revokeAppleOnAccountDeletion({
      appleLinked: true,
      authorizationCode: '   ',
      env: appleEnv(),
      fetchImpl: (async () => {
        fetched = true;
        return new Response(null, { status: 500 });
      }) as typeof fetch,
      warn: (event, reason) => warnings.push(`${event} ${reason}`),
    });
    assert.equal(result, 'skipped');
    assert.equal(fetched, false);
    assert.deepEqual(warnings, ['apple token revoke skipped missing-authorization-code']);
    assertNoSecrets(warnings.join('\n'));
  });

  it('skips when Apple env is missing and does not log configured values', async () => {
    let fetched = false;
    const warnings: string[] = [];
    const result = await revokeAppleOnAccountDeletion({
      appleLinked: true,
      authorizationCode: AUTH_CODE,
      env: appleEnv({
        APPLE_SIWA_KEY_ID: '  ',
        APPLE_SIWA_CLIENT_ID: undefined,
      }),
      fetchImpl: (async () => {
        fetched = true;
        return new Response(null, { status: 500 });
      }) as typeof fetch,
      warn: (event, reason) => warnings.push(`${event} ${reason}`),
    });
    assert.equal(result, 'skipped');
    assert.equal(fetched, false);
    assert.deepEqual(warnings, [
      'apple token revoke skipped missing-env:APPLE_SIWA_KEY_ID,APPLE_SIWA_CLIENT_ID',
    ]);
    assertNoSecrets(warnings.join('\n'), [TEAM_ID, PRIVATE_KEY_PEM]);
  });

  it('logs a warning through the default logger without the private key', async () => {
    const original = console.warn;
    const lines: string[] = [];
    console.warn = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    let result: string | null = null;
    try {
      const pending = revokeAppleOnAccountDeletion({
        appleLinked: true,
        authorizationCode: AUTH_CODE,
        env: { APPLE_SIWA_PRIVATE_KEY: escapedPrivateKey() },
      });
      const snapshot = [...lines];
      console.warn = original;
      result = await pending;
      assert.equal(result, 'skipped');
      assert.deepEqual(snapshot, [
        '[account] apple token revoke skipped missing-env:APPLE_TEAM_ID,APPLE_SIWA_KEY_ID,APPLE_SIWA_CLIENT_ID',
      ]);
      assertNoSecrets(snapshot.join('\n'));
    } finally {
      console.warn = original;
    }
  });

  it('does not call Apple when the private key cannot be used', async () => {
    const warnings: string[] = [];
    let fetched = false;
    const badKey = 'not-a-key-SECRETVALUE';
    const result = await revokeAppleOnAccountDeletion({
      appleLinked: true,
      authorizationCode: AUTH_CODE,
      env: appleEnv({ APPLE_SIWA_PRIVATE_KEY: badKey }),
      fetchImpl: (async () => {
        fetched = true;
        return new Response(null, { status: 500 });
      }) as typeof fetch,
      warn: (event, reason) => warnings.push(`${event} ${reason}`),
    });
    assert.equal(result, 'failed');
    assert.equal(fetched, false);
    assert.deepEqual(warnings, ['apple token revoke failed client-secret']);
    assert.equal(warnings.join('\n').includes(badKey), false);
  });

  it('continues past a token exchange failure and does not revoke', async () => {
    const warnings: string[] = [];
    const { calls, fetchImpl } = recordedFetch(
      () =>
        Response.json(
          { error: 'invalid_grant', refresh_token: REFRESH_TOKEN, code: AUTH_CODE },
          { status: 400 }
        )
    );
    const result = await revokeAppleOnAccountDeletion({
      appleLinked: true,
      authorizationCode: AUTH_CODE,
      env: appleEnv(),
      fetchImpl,
      nowSeconds: NOW,
      warn: (event, reason) => warnings.push(`${event} ${reason}`),
    });
    assert.equal(result, 'failed');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://appleid.apple.com/auth/token');
    assert.deepEqual(warnings, ['apple token revoke failed token-exchange:invalid_grant']);
    assertNoSecrets(warnings.join('\n'));
  });

  it('returns failed when Apple does not return a refresh token', async () => {
    const warnings: string[] = [];
    const { calls, fetchImpl } = recordedFetch(() =>
      Response.json({ access_token: ACCESS_TOKEN })
    );
    const result = await revokeAppleOnAccountDeletion({
      appleLinked: true,
      authorizationCode: AUTH_CODE,
      env: appleEnv(),
      fetchImpl,
      nowSeconds: NOW,
      warn: (event, reason) => warnings.push(`${event} ${reason}`),
    });
    assert.equal(result, 'failed');
    assert.equal(calls.length, 1);
    assert.deepEqual(warnings, ['apple token revoke failed token-exchange:no-refresh-token']);
    assertNoSecrets(warnings.join('\n'));
  });

  it('returns failed when the revoke call is rejected and does not throw', async () => {
    const warnings: string[] = [];
    const { calls, fetchImpl } = recordedFetch(call => {
      if (call.url === 'https://appleid.apple.com/auth/token') {
        return Response.json({ refresh_token: REFRESH_TOKEN });
      }
      return Response.json({ error: 'invalid_token', token: REFRESH_TOKEN }, { status: 400 });
    });
    const result = await revokeAppleOnAccountDeletion({
      appleLinked: true,
      authorizationCode: AUTH_CODE,
      env: appleEnv(),
      fetchImpl,
      nowSeconds: NOW,
      warn: (event, reason) => warnings.push(`${event} ${reason}`),
    });
    assert.equal(result, 'failed');
    assert.equal(calls.length, 2);
    assert.deepEqual(warnings, ['apple token revoke failed revoke:invalid_token']);
    assertNoSecrets(warnings.join('\n'));
  });

  it('returns failed when fetch throws', async () => {
    const warnings: string[] = [];
    const result = await revokeAppleOnAccountDeletion({
      appleLinked: true,
      authorizationCode: AUTH_CODE,
      env: appleEnv(),
      fetchImpl: (async () => {
        throw new Error(`network down ${AUTH_CODE} ${REFRESH_TOKEN}`);
      }) as typeof fetch,
      nowSeconds: NOW,
      warn: (event, reason) => warnings.push(`${event} ${reason}`),
    });
    assert.equal(result, 'failed');
    assert.deepEqual(warnings, ['apple token revoke failed token-exchange']);
    assertNoSecrets(warnings.join('\n'));
  });
});
