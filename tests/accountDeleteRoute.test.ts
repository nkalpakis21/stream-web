import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { DELETE } from '../app/api/account/route';
import { setDeleteAccountForTests } from '../lib/server/accountDeletion';
import { setAppleFetchForTests } from '../lib/server/appleRevoke';
import {
  AccountAuthError,
  isRecentSignIn,
  RECENT_LOGIN_WINDOW_SECONDS,
  requireRecentAccountUser,
  setAccountTokenVerifierForTests,
  type AccountUser,
} from '../lib/server/accountAuth';

const UID = 'user-1';
const EMAIL = 'person@example.com';
const TOKEN = 'valid-id-token';

type Decoded = {
  uid?: string;
  email?: string;
  auth_time?: number;
  firebase?: {
    sign_in_provider?: string;
    identities?: Record<string, string[]>;
  };
};

function deleteRequest(authorization?: string, body?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new NextRequest('https://streamstar.xyz/api/account', {
    method: 'DELETE',
    headers,
    body,
  });
}

function oldAuthTime(): number {
  return Math.floor(Date.now() / 1000) - RECENT_LOGIN_WINDOW_SECONDS - 3600;
}

function installVerifier(decoded: Decoded): { calls: Array<{ token: string; checkRevoked: boolean }> } {
  const calls: Array<{ token: string; checkRevoked: boolean }> = [];
  setAccountTokenVerifierForTests(async (token, checkRevoked) => {
    calls.push({ token, checkRevoked });
    return decoded;
  });
  return { calls };
}

afterEach(() => {
  setAccountTokenVerifierForTests(null);
  setDeleteAccountForTests(null);
  setAppleFetchForTests(null);
});

describe('DELETE /api/account', () => {
  it('returns 200 for an old auth_time when the token is valid', async () => {
    const authTime = oldAuthTime();
    assert.equal(isRecentSignIn(authTime, Math.floor(Date.now() / 1000)), false);

    const { calls } = installVerifier({
      uid: UID,
      email: EMAIL,
      auth_time: authTime,
      firebase: { sign_in_provider: 'google.com', identities: {} },
    });
    const deleted: Array<{ uid: string; email: string | null }> = [];
    setDeleteAccountForTests(async (uid, email) => {
      deleted.push({ uid, email });
    });

    const response = await DELETE(deleteRequest(`Bearer ${TOKEN}`));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(calls, [{ token: TOKEN, checkRevoked: true }]);
    assert.deepEqual(deleted, [{ uid: UID, email: EMAIL }]);
  });

  it('returns 200 when auth_time is missing and the token is valid', async () => {
    installVerifier({
      uid: UID,
      email: EMAIL,
      firebase: { sign_in_provider: 'password' },
    });
    let deleted = false;
    setDeleteAccountForTests(async () => {
      deleted = true;
    });

    const response = await DELETE(deleteRequest(`Bearer ${TOKEN}`));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(deleted, true);
  });

  it('skips Apple revoke when an Apple user sends no authorization code', async () => {
    installVerifier({
      uid: UID,
      email: EMAIL,
      auth_time: oldAuthTime(),
      firebase: {
        sign_in_provider: 'apple.com',
        identities: { 'apple.com': ['apple-user'] },
      },
    });
    let deleted = false;
    setDeleteAccountForTests(async () => {
      deleted = true;
    });

    const response = await DELETE(deleteRequest(`Bearer ${TOKEN}`));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, appleRevoke: 'skipped' });
    assert.equal(deleted, true);
  });

  it('revokes Apple when an authorization code is present', async () => {
    installVerifier({
      uid: UID,
      email: EMAIL,
      auth_time: oldAuthTime(),
      firebase: { sign_in_provider: 'apple.com' },
    });
    const events: string[] = [];
    setDeleteAccountForTests(async () => {
      events.push('delete');
    });

    const calls: string[] = [];
    setAppleFetchForTests(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url === 'https://appleid.apple.com/auth/token') {
        return Response.json({ refresh_token: 'refresh-token-value' });
      }
      assert.equal(url, 'https://appleid.apple.com/auth/revoke');
      events.push('revoke');
      return new Response(null, { status: 200 });
    });

    const { generateKeyPairSync } = await import('node:crypto');
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const previous = {
      APPLE_TEAM_ID: process.env.APPLE_TEAM_ID,
      APPLE_SIWA_KEY_ID: process.env.APPLE_SIWA_KEY_ID,
      APPLE_SIWA_PRIVATE_KEY: process.env.APPLE_SIWA_PRIVATE_KEY,
      APPLE_SIWA_CLIENT_ID: process.env.APPLE_SIWA_CLIENT_ID,
    };
    process.env.APPLE_TEAM_ID = 'TEAMID1234';
    process.env.APPLE_SIWA_KEY_ID = 'KEYID123456';
    process.env.APPLE_SIWA_PRIVATE_KEY = pem;
    process.env.APPLE_SIWA_CLIENT_ID = 'com.example.streamstar';

    try {
      const response = await DELETE(
        deleteRequest(
          `Bearer ${TOKEN}`,
          JSON.stringify({ appleAuthorizationCode: 'auth-code' })
        )
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, appleRevoke: 'revoked' });
      assert.deepEqual(calls, [
        'https://appleid.apple.com/auth/token',
        'https://appleid.apple.com/auth/revoke',
      ]);
      assert.deepEqual(events, ['revoke', 'delete']);
    } finally {
      setAppleFetchForTests(null);
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('returns 401 and does not delete when the token is revoked', async () => {
    const calls: boolean[] = [];
    setAccountTokenVerifierForTests(async (_token, checkRevoked) => {
      calls.push(checkRevoked);
      throw Object.assign(new Error('revoked'), { code: 'auth/id-token-revoked' });
    });
    let deleted = false;
    setDeleteAccountForTests(async () => {
      deleted = true;
    });

    const response = await DELETE(deleteRequest('Bearer revoked-token'));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
    assert.deepEqual(calls, [true]);
    assert.equal(deleted, false);
  });

  it('returns 401 when the Authorization header is missing', async () => {
    let verified = false;
    setAccountTokenVerifierForTests(async () => {
      verified = true;
      return { uid: UID };
    });

    const response = await DELETE(deleteRequest());
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
    assert.equal(verified, false);
  });
});

describe('requireRecentAccountUser', () => {
  it('still rejects an old auth_time', async () => {
    const authTime = oldAuthTime();
    installVerifier({
      uid: UID,
      email: EMAIL,
      auth_time: authTime,
      firebase: { sign_in_provider: 'google.com' },
    });

    await assert.rejects(
      () => requireRecentAccountUser(deleteRequest(`Bearer ${TOKEN}`)),
      (error: unknown) => {
        assert.ok(error instanceof AccountAuthError);
        assert.equal(error.code, 'requires-recent-login');
        assert.equal(error.status, 401);
        return true;
      }
    );
  });

  it('still accepts a fresh auth_time', async () => {
    installVerifier({
      uid: UID,
      email: EMAIL,
      auth_time: Math.floor(Date.now() / 1000),
      firebase: { sign_in_provider: 'google.com' },
    });

    const user: AccountUser = await requireRecentAccountUser(deleteRequest(`Bearer ${TOKEN}`));
    assert.deepEqual(user, { uid: UID, email: EMAIL, appleLinked: false });
  });
});
