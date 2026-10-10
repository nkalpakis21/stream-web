import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { HttpError, requireUser } from '../lib/server/auth';

function request(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  return new NextRequest('https://streamstar.xyz/api/example', { headers });
}

describe('requireUser', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    await assert.rejects(
      () => requireUser(request()),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.status, 401);
        return true;
      }
    );
  });

  it('returns 401 when the scheme is not Bearer', async () => {
    await assert.rejects(
      () => requireUser(request('Basic abc')),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.status, 401);
        return true;
      }
    );
  });

  it('returns 401 for an empty bearer token', async () => {
    await assert.rejects(
      () => requireUser(request('Bearer   ')),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.status, 401);
        return true;
      }
    );
  });

  it('returns the uid from the verified token and ignores other ids', async () => {
    const uid = await requireUser(request('Bearer good-token'), {
      verifyToken: async (token) => {
        assert.equal(token, 'good-token');
        return { uid: 'user-from-token' };
      },
    });
    assert.equal(uid, 'user-from-token');
  });

  it('returns 401 when verification fails', async () => {
    await assert.rejects(
      () =>
        requireUser(request('Bearer bad'), {
          verifyToken: async () => {
            throw new Error('expired');
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.status, 401);
        return true;
      }
    );
  });
});
