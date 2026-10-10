import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isRecentSignIn, RECENT_LOGIN_WINDOW_SECONDS } from './accountAuth';
import {
  coinMetadataObjectPaths,
  collectEmails,
  commitBulkDeletes,
  deleteAccountIdentity,
  firebaseStorageObjectPath,
  isAuthUserNotFound,
  isPersonalValue,
  prefixedObjectsDeleted,
  resolveLaunchedCoinImages,
  stripPersonalFields,
  type ArtistCoinSource,
} from './deleteAccount';
import {
  fetchMetaplexMetadataUri,
  metaplexMetadataUriFromAccount,
} from '@/lib/solana/metaplexCoinMetadata';

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

describe('launched coin images', () => {
  const bucket = 'streamstar.appspot.com';
  const uid = 'uid-1';
  const coinId = '0123456789abcdef0123456789abcdef';
  const prefix = `artist-looks/${uid}/`;
  const coinObject = `${prefix}coin.jpg`;
  const otherObject = `${prefix}other.jpg`;
  const olderObject = `${prefix}older.jpg`;
  const coinUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(coinObject)}?alt=media&token=t`;
  const avatarUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(coinObject)}?alt=media&token=a`;
  const olderUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(olderObject)}?alt=media&token=o`;
  const laterUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(otherObject)}?alt=media&token=n`;
  const objects = [coinObject, otherObject, olderObject];

  const launched: ArtistCoinSource = {
    id: 'artist-1',
    mint: 'MintAddress111111111111111111111111111111',
    launchedAtMs: 2_000,
    avatarURL: avatarUrl,
    coinMetadataId: null,
    coinImagePath: null,
  };

  it('keeps the resolved coin image and deletes the other looks', async () => {
    const plan = await resolveLaunchedCoinImages({
      artists: [launched],
      versions: [],
      bucketName: bucket,
      readMetadataUri: async () => `https://www.streamstar.xyz/c/${coinId}`,
      readCoinImageUrl: async objectPath => {
        assert.equal(objectPath, `c/${coinId}.json`);
        return coinUrl;
      },
    });
    assert.deepEqual(plan.strip, [`c/${coinId}.json`]);
    assert.deepEqual(plan.keep, [coinObject]);
    assert.deepEqual(
      prefixedObjectsDeleted(prefix, objects, new Set(plan.keep)),
      [otherObject, olderObject]
    );
  });

  it('keeps the avatar and pre-launch looks when RPC fails', async () => {
    const logs: string[] = [];
    const plan = await resolveLaunchedCoinImages({
      artists: [launched],
      versions: [
        { artistId: 'artist-1', avatarURL: olderUrl, createdAtMs: 1_000 },
        { artistId: 'artist-1', avatarURL: laterUrl, createdAtMs: 3_000 },
      ],
      bucketName: bucket,
      readMetadataUri: async () => {
        throw new Error('rpc down');
      },
      readCoinImageUrl: async () => null,
      logFallback: artistId => logs.push(`coin_image_kept_fallback ${artistId}`),
    });
    assert.deepEqual(logs, ['coin_image_kept_fallback artist-1']);
    assert.equal(logs.some(line => line.includes(uid)), false);
    assert.deepEqual(plan.strip, []);
    const deleted = prefixedObjectsDeleted(prefix, objects, new Set(plan.keep));
    assert.deepEqual(deleted, [otherObject]);
    assert.ok(plan.keep.includes(coinObject));
    assert.ok(plan.keep.includes(olderObject));
  });

  it('deletes every look when the artist has no mint', async () => {
    let lookedUp = false;
    const plan = await resolveLaunchedCoinImages({
      artists: [{ ...launched, mint: null }],
      versions: [
        { artistId: 'artist-1', avatarURL: olderUrl, createdAtMs: 1_000 },
      ],
      bucketName: bucket,
      readMetadataUri: async () => {
        lookedUp = true;
        return `https://www.streamstar.xyz/c/${coinId}`;
      },
      readCoinImageUrl: async () => coinUrl,
    });
    assert.equal(lookedUp, false);
    assert.deepEqual(plan.keep, []);
    assert.deepEqual(plan.strip, []);
    assert.deepEqual(
      prefixedObjectsDeleted(prefix, objects, new Set(plan.keep)),
      objects
    );
  });

  it('aborts a slow RPC and keeps the look', async () => {
    let aborted = false;
    const started = Date.now();
    const plan = await resolveLaunchedCoinImages({
      artists: [launched],
      versions: [{ artistId: 'artist-1', avatarURL: olderUrl, createdAtMs: 1_000 }],
      bucketName: bucket,
      timeoutMs: 40,
      readMetadataUri: (_mint, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted = signal.aborted;
            reject(new Error('aborted'));
          });
        }),
      readCoinImageUrl: async () => null,
    });
    assert.equal(aborted, true);
    assert.ok(Date.now() - started < 1000);
    assert.ok(plan.keep.includes(coinObject));
    assert.ok(plan.keep.includes(olderObject));
    assert.equal(plan.keep.includes(otherObject), false);
  });

  it('uses stored coin ids before the network', async () => {
    let lookedUp = false;
    const plan = await resolveLaunchedCoinImages({
      artists: [
        {
          ...launched,
          coinMetadataId: coinId,
          coinImagePath: coinObject,
        },
      ],
      versions: [],
      bucketName: bucket,
      readMetadataUri: async () => {
        lookedUp = true;
        return null;
      },
      readCoinImageUrl: async () => null,
    });
    assert.equal(lookedUp, false);
    assert.deepEqual(plan.keep, [coinObject]);
    assert.deepEqual(plan.strip, [`c/${coinId}.json`]);
  });
});

describe('metaplex metadata uri', () => {
  it('reads the uri string from a metadata account', () => {
    const id = '0123456789abcdef0123456789abcdef';
    const uri = `https://www.streamstar.xyz/c/${id}`;
    const borsh = (value: string) => {
      const bytes = Buffer.from(value, 'utf8');
      const header = Buffer.alloc(4);
      header.writeUInt32LE(bytes.length, 0);
      return Buffer.concat([header, bytes]);
    };
    const data = Buffer.concat([
      Buffer.from([4]),
      Buffer.alloc(32),
      Buffer.alloc(32),
      borsh('Nova'),
      borsh('NOVA'),
      borsh(uri),
    ]);
    assert.equal(metaplexMetadataUriFromAccount(data), uri);
    assert.deepEqual(coinMetadataObjectPaths(uri), [`c/${id}.json`]);
  });

  it('reads the account through an RPC getAccountInfo response', async () => {
    const uri = 'https://www.streamstar.xyz/c/0123456789abcdef0123456789abcdef';
    const borsh = (value: string) => {
      const bytes = Buffer.from(value, 'utf8');
      const header = Buffer.alloc(4);
      header.writeUInt32LE(bytes.length, 0);
      return Buffer.concat([header, bytes]);
    };
    const data = Buffer.concat([
      Buffer.from([4]),
      Buffer.alloc(64),
      borsh('Nova'),
      borsh('NOVA'),
      borsh(uri),
    ]);
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          result: { value: { data: [data.toString('base64'), 'base64'] } },
        }),
        { status: 200 }
      )) as typeof fetch;
    const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    assert.equal(await fetchMetaplexMetadataUri(mint, 'https://rpc.example', { fetchImpl }), uri);
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

describe('coin metadata upload delete', () => {
  const uid = 'user-1';
  const uploadId = '0123456789abcdef0123456789abcdef';

  function identityDb(options: {
    uploads?: string[];
    listError?: unknown;
    parentMissing?: boolean;
    deleteError?: unknown;
  }) {
    const events: string[] = [];
    let flushed = false;
    const pending: Array<() => void> = [];
    const db = {
      events,
      collection(name: string) {
        return {
          doc(id: string) {
            const path = `${name}/${id}`;
            return {
              path,
              collection(sub: string) {
                return {
                  async get() {
                    events.push(`list:${path}/${sub}`);
                    if (options.listError) throw options.listError;
                    return {
                      docs: (options.uploads ?? []).map(id => ({
                        ref: { path: `${path}/${sub}/${id}` },
                      })),
                    };
                  },
                };
              },
            };
          },
        };
      },
      bulkWriter() {
        return {
          onWriteError() {
            return this;
          },
          delete(ref: { path: string }) {
            return new Promise<void>((resolve, reject) => {
              pending.push(() => {
                if (!flushed) {
                  reject(new Error(`awaited ${ref.path} before flush`));
                  return;
                }
                events.push(`delete:${ref.path}`);
                if (options.deleteError) {
                  reject(options.deleteError);
                  return;
                }
                if (options.parentMissing && ref.path === `coinMetadataUploads/${uid}`) {
                  reject(Object.assign(new Error('missing'), { code: 5 }));
                  return;
                }
                resolve();
              });
            });
          },
          async flush() {
            flushed = true;
            const batch = pending.splice(0, pending.length);
            for (const settle of batch) settle();
          },
          async close() {
            events.push('close');
          },
        };
      },
      async recursiveDelete(ref: { path: string }) {
        events.push(`recursive:${ref.path}`);
      },
    };
    return db;
  }

  it('deletes coinUploads and the parent before the Auth user', { timeout: 1000 }, async () => {
    const db = identityDb({ uploads: [uploadId] });
    await deleteAccountIdentity(db as never, uid, async userId => {
      db.events.push(`auth:${userId}`);
    });
    assert.deepEqual(db.events, [
      `list:coinMetadataUploads/${uid}/coinUploads`,
      `delete:coinMetadataUploads/${uid}/coinUploads/${uploadId}`,
      `delete:coinMetadataUploads/${uid}`,
      'close',
      `recursive:users/${uid}`,
      `auth:${uid}`,
    ]);
  });

  it('treats a missing coinMetadataUploads doc as success and still deletes Auth', async () => {
    const db = identityDb({ uploads: [], parentMissing: true });
    await deleteAccountIdentity(db as never, uid, async userId => {
      db.events.push(`auth:${userId}`);
    });
    assert.deepEqual(db.events, [
      `list:coinMetadataUploads/${uid}/coinUploads`,
      `delete:coinMetadataUploads/${uid}`,
      'close',
      `recursive:users/${uid}`,
      `auth:${uid}`,
    ]);
  });

  it('treats a missing coinUploads list as success', async () => {
    const db = identityDb({
      listError: Object.assign(new Error('missing'), { code: 'not-found' }),
    });
    await deleteAccountIdentity(db as never, uid, async userId => {
      db.events.push(`auth:${userId}`);
    });
    assert.ok(db.events.includes(`auth:${uid}`));
    assert.equal(db.events[0], `list:coinMetadataUploads/${uid}/coinUploads`);
    assert.ok(db.events.indexOf(`recursive:users/${uid}`) < db.events.indexOf(`auth:${uid}`));
  });

  it('does not delete the Auth user when a coin upload delete fails', async () => {
    const db = identityDb({
      uploads: [uploadId],
      deleteError: Object.assign(new Error('unavailable'), { code: 14 }),
    });
    let authCalled = false;
    await assert.rejects(
      () =>
        deleteAccountIdentity(db as never, uid, async () => {
          authCalled = true;
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /unavailable/);
        return true;
      }
    );
    assert.equal(authCalled, false);
    assert.equal(db.events.includes(`recursive:users/${uid}`), false);
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
