import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { POST, setPushRegisterForTests } from '../lib/server/pushRegister';
import { pushTokenDocId } from '../lib/server/expoPush';

const TOKEN = 'ExponentPushToken[abc12345]';

function post(body: unknown, authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization) headers.set('authorization', authorization);
  return new NextRequest('https://streamstar.xyz/api/push/register', {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

afterEach(() => {
  setPushRegisterForTests(null);
});

describe('POST /api/push/register', () => {
  it('stores one document per token for the signed-in user', async () => {
    const saved: { uid: string; token: string; id: string }[] = [];
    setPushRegisterForTests({
      verifyToken: async () => ({ uid: 'alice' }),
      save: async (uid, token) => {
        saved.push({ uid, token, id: pushTokenDocId(token) });
      },
    });

    const missing = await POST(post({ token: TOKEN, platform: 'ios' }));
    assert.equal(missing.status, 401);

    const android = await POST(post({ token: TOKEN, platform: 'android' }, 'Bearer token'));
    assert.equal(android.status, 400);

    const bad = await POST(post({ token: 'not-a-token', platform: 'ios' }, 'Bearer token'));
    assert.equal(bad.status, 400);

    const first = await POST(post({ token: TOKEN, platform: 'ios' }, 'Bearer token'));
    const second = await POST(post({ token: TOKEN, platform: 'ios' }, 'Bearer token'));
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal((await first.json()).ok, true);
    assert.equal(saved.length, 2);
    assert.equal(saved[0]?.uid, 'alice');
    assert.equal(saved[0]?.id, saved[1]?.id);
    assert.equal(saved[0]?.token, TOKEN);
  });
});
