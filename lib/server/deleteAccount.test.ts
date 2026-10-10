import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isRecentSignIn, RECENT_LOGIN_WINDOW_SECONDS } from './accountAuth';
import {
  coinMetadataObjectPaths,
  collectEmails,
  commitBulkDeletes,
  firebaseStorageObjectPath,
  isAuthUserNotFound,
  isPersonalValue,
  stripPersonalFields,
} from './deleteAccount';

describe('recent sign-in', () => {
  const now = 1_700_000_000;

  it('accepts auth_time inside the 5 minute window', () => {
    assert.equal(isRecentSignIn(now - RECENT_LOGIN_WINDOW_SECONDS, now), true);
    assert.equal(isRecentSignIn(now - 1, now), true);
  });

  it('rejects auth_time older than 5 minutes', () => {
    assert.equal(isRecentSignIn(now - RECENT_LOGIN_WINDOW_SECONDS - 1, now), false);
  });
});

describe('coin personal fields', () => {
  const uid = 'user-1';
  const emails = collectEmails('Person@Example.com', 'person@example.com', null, 'not-an-email');

  it('keeps one email and ignores values that are not emails', () => {
    assert.deepEqual(emails, ['Person@Example.com']);
  });

  it('matches uid exactly and email case-insensitively', () => {
    assert.equal(isPersonalValue(uid, uid, emails), true);
    assert.equal(isPersonalValue('person@example.com', uid, emails), true);
    assert.equal(isPersonalValue('https://example.com/user-1', uid, emails), false);
  });

  it('strips uid and email fields and keeps the rest of the coin record', () => {
    const coin = {
      name: 'Nova',
      symbol: 'NOVA',
      description: 'Nova on Streamstar',
      image: 'https://example.com/look.png',
      uploadedBy: uid,
      ownerEmail: 'person@example.com',
      nested: { note: 'keep', email: 'Person@Example.com' },
      tags: ['keep', uid],
    };

    const stripped = stripPersonalFields(coin, uid, emails);
    assert.equal(stripped.changed, true);
    assert.deepEqual(stripped.value, {
      name: 'Nova',
      symbol: 'NOVA',
      description: 'Nova on Streamstar',
      image: 'https://example.com/look.png',
      nested: { note: 'keep' },
      tags: ['keep'],
    });
  });

  it('does not rewrite a coin record with no personal values', () => {
    const coin = { name: 'Nova', symbol: 'NOVA', image: 'https://example.com/a.png' };
    const stripped = stripPersonalFields(coin, uid, emails);
    assert.equal(stripped.changed, false);
    assert.equal(stripped.value, coin);
  });
});

describe('storage object paths', () => {
  const bucket = 'streamstar.appspot.com';

  it('parses both our-bucket URL forms', () => {
    assert.equal(
      firebaseStorageObjectPath(
        'https://firebasestorage.googleapis.com/v0/b/streamstar.appspot.com/o/songs%2Fsong1%2Fcover%2Fposter.jpg?alt=media&token=t',
        bucket
      ),
      'songs/song1/cover/poster.jpg'
    );
    assert.equal(
      firebaseStorageObjectPath(
        'https://storage.googleapis.com/streamstar.appspot.com/songs/song1/cover/loop.mp4',
        bucket
      ),
      'songs/song1/cover/loop.mp4'
    );
  });

  it('decodes a %2F path on the Firebase download URL', () => {
    assert.equal(
      firebaseStorageObjectPath(
        'https://firebasestorage.googleapis.com/v0/b/streamstar.appspot.com/o/artist-looks%2Fuid%2Fface.jpg?alt=media&token=abc',
        bucket
      ),
      'artist-looks/uid/face.jpg'
    );
  });

  it('skips a foreign bucket', () => {
    assert.equal(
      firebaseStorageObjectPath(
        'https://firebasestorage.googleapis.com/v0/b/other.appspot.com/o/artist-looks%2Fuid%2Fface.jpg?alt=media',
        bucket
      ),
      null
    );
    assert.equal(
      firebaseStorageObjectPath(
        'https://storage.googleapis.com/other.appspot.com/songs/song1/cover/poster.jpg',
        bucket
      ),
      null
    );
  });

  it('skips an external host', () => {
    assert.equal(
      firebaseStorageObjectPath('https://v3.fal.media/files/look.jpg', bucket),
      null
    );
    assert.equal(
      firebaseStorageObjectPath('https://lalals.s3.amazonaws.com/cover.jpg', bucket),
      null
    );
    assert.equal(
      firebaseStorageObjectPath('https://musicgpt.com/audio/track.mp3', bucket),
      null
    );
    assert.equal(
      firebaseStorageObjectPath('https://lh3.googleusercontent.com/a/photo', bucket),
      null
    );
    assert.equal(
      firebaseStorageObjectPath('gs://streamstar.appspot.com/audio/song1.mp3', bucket),
      null
    );
  });
});

describe('coin metadata paths', () => {
  const id = '0123456789abcdef0123456789abcdef';

  it('reads a metadata URI, an object path, and a coin id field', () => {
    assert.deepEqual(
      coinMetadataObjectPaths({
        pumpFun: {
          metadataUri: `https://www.streamstar.xyz/c/${id}`,
          url: 'https://pump.fun/coin/MintAddress111',
        },
      }),
      [`c/${id}.json`]
    );
    assert.deepEqual(coinMetadataObjectPaths({ image: `c/${id}.json` }), [`c/${id}.json`]);
    assert.deepEqual(coinMetadataObjectPaths({ coinId: id }), [`c/${id}.json`]);
  });

  it('finds nothing on an artist that only stored mint and a pump.fun URL', () => {
    assert.deepEqual(
      coinMetadataObjectPaths({
        ownerId: 'user-1',
        avatarURL: 'https://fal.media/look.jpg',
        pumpFun: {
          mint: 'MintAddress111',
          url: 'https://pump.fun/coin/MintAddress111',
          symbol: 'NOVA',
          creatorWallet: 'wallet',
        },
      }),
      []
    );
  });
});

describe('bulk deletes', () => {
  it('flushes before awaiting when fewer than 20 docs are queued', { timeout: 1000 }, async () => {
    let flushed = false;
    const pending: Array<() => void> = [];
    const writer = {
      delete(ref: string) {
        return new Promise<void>(resolve => {
          pending.push(() => {
            assert.equal(flushed, true, ref);
            resolve();
          });
        });
      },
      async flush() {
        flushed = true;
        for (const settle of pending) settle();
      },
    };
    const refs = ['a', 'b', 'c'];
    assert.ok(refs.length < 20);
    await commitBulkDeletes(writer, refs);
    assert.equal(flushed, true);
    assert.equal(pending.length, refs.length);
  });

  it('rejects when a delete fails after flush', async () => {
    const pending: Array<(err: Error) => void> = [];
    const writer = {
      delete() {
        return new Promise<void>((_resolve, reject) => {
          pending.push(reject);
        });
      },
      async flush() {
        for (const reject of pending) reject(new Error('delete-failed'));
      },
    };
    await assert.rejects(() => commitBulkDeletes(writer, ['a', 'b']), /delete-failed/);
  });
});

describe('auth user already gone', () => {
  it('treats auth/user-not-found as success', () => {
    assert.equal(isAuthUserNotFound({ code: 'auth/user-not-found' }), true);
    assert.equal(
      isAuthUserNotFound({ errorInfo: { code: 'auth/user-not-found' } }),
      true
    );
    assert.equal(isAuthUserNotFound({ code: 'auth/internal-error' }), false);
    assert.equal(isAuthUserNotFound(new Error('auth/user-not-found')), false);
  });
});
