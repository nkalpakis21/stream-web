import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  adminBucketObjectPath,
  coinMetadataIdFromUpload,
  coinMetadataIdFromUri,
} from '@/lib/solana/coinMetadata';
import { pumpFunMetadataObjectPath } from '@/lib/solana/pumpFun';
import {
  ArtistPumpFunPersistError,
  persistArtistPumpFun,
  type CoinMetadataBucket,
  type PersistArtistPumpFunInput,
} from '@/lib/services/artistPumpFun';
import { selectPendingCoinMetadataId } from '@/lib/services/coinMetadataPending';
import type { AIArtistDocument, PumpFunCoin } from '@/types/firestore';

const BUCKET = 'streamstar.appspot.com';
const UID = 'user-1';
const METADATA_ID = 'a'.repeat(32);
const IMAGE_PATH = 'artist-looks/user-1/look.jpg';

function firebaseDownloadUrl(bucket: string, objectPath: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media&token=t`;
}

function artist(partial: Partial<AIArtistDocument> & { ownerId: string }): AIArtistDocument {
  return {
    deletedAt: null,
    pumpFun: null,
    ...partial,
  } as AIArtistDocument;
}

function memoryDb(initial: AIArtistDocument | null) {
  const writes: Record<string, unknown>[] = [];
  let current = initial;
  return {
    writes,
    collection() {
      return {
        doc(id: string) {
          return { id };
        },
      };
    },
    async runTransaction<T>(
      fn: (tx: {
        get: (ref: { id: string }) => Promise<{
          exists: boolean;
          data: () => AIArtistDocument | undefined;
        }>;
        set: (ref: { id: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => void;
      }) => Promise<T>
    ) {
      return fn({
        async get() {
          return {
            exists: current != null,
            data: () => current ?? undefined,
          };
        },
        set(_ref, data) {
          writes.push(data);
          if (current && data.pumpFun && typeof data.pumpFun === 'object') {
            current = { ...current, pumpFun: data.pumpFun as PumpFunCoin };
          }
        },
      });
    },
  };
}

function metadataBucket(options: {
  uploadedBy?: unknown;
  image?: unknown;
  missing?: boolean;
  bucketName?: string;
}): CoinMetadataBucket & { calls: string[] } {
  const calls: string[] = [];
  return {
    name: options.bucketName ?? BUCKET,
    calls,
    file(objectPath: string) {
      calls.push(objectPath);
      return {
        async getMetadata() {
          if (options.missing) {
            throw Object.assign(new Error('No such object'), { code: 404 });
          }
          const custom =
            options.uploadedBy === undefined ? {} : { uploadedBy: options.uploadedBy };
          return [{ metadata: custom }];
        },
        async download() {
          return [Buffer.from(JSON.stringify({ name: 'Nova', symbol: 'NOVA', image: options.image }))];
        },
      };
    },
  };
}

function assertStoredAtArtistRoot(
  write: Record<string, unknown> | undefined,
  id: string,
  imagePath: string | null
) {
  assert.ok(write);
  assert.equal(write.coinMetadataId, id);
  assert.equal(write.coinImagePath, imagePath);
  const pump = write.pumpFun as Record<string, unknown> | undefined;
  if (pump) {
    assert.equal(Object.hasOwn(pump, 'coinMetadataId'), false);
    assert.equal(Object.hasOwn(pump, 'coinImagePath'), false);
  }
}

function launchInput(
  extra: Partial<PersistArtistPumpFunInput> = {}
): PersistArtistPumpFunInput {
  return {
    artistId: 'artist-1',
    userId: UID,
    mint: 'Mint1111111111111111111111111111111111111',
    url: 'https://pump.fun/coin/Mint1111111111111111111111111111111111111',
    symbol: 'NOVA',
    launchedAtMs: 1_700_000_000_000,
    creatorWallet: 'Wallet111111111111111111111111111111111111',
    ...extra,
  };
}

describe('coin metadata id parsing', () => {
  it('reads the id from the public metadata URI', () => {
    const uri = `https://www.streamstar.xyz/c/${METADATA_ID}`;
    assert.equal(coinMetadataIdFromUri(uri), METADATA_ID);
    assert.equal(
      coinMetadataIdFromUpload({ uri, id: '' }),
      METADATA_ID
    );
  });

  it('prefers the id returned by the metadata route', () => {
    assert.equal(
      coinMetadataIdFromUpload({
        id: METADATA_ID,
        uri: 'https://www.streamstar.xyz/c/' + 'b'.repeat(32),
      }),
      METADATA_ID
    );
  });

  it('rejects a client storage path', () => {
    assert.equal(coinMetadataIdFromUri(`c/${METADATA_ID}.json`), null);
    assert.equal(coinMetadataIdFromUri(`gs://${BUCKET}/c/${METADATA_ID}.json`), null);
    assert.equal(adminBucketObjectPath(IMAGE_PATH, BUCKET), null);
    assert.equal(adminBucketObjectPath(`gs://${BUCKET}/${IMAGE_PATH}`, BUCKET), null);
  });

  it('reads an object path only from this bucket', () => {
    assert.equal(
      adminBucketObjectPath(firebaseDownloadUrl(BUCKET, IMAGE_PATH), BUCKET),
      IMAGE_PATH
    );
    assert.equal(
      adminBucketObjectPath(`https://storage.googleapis.com/${BUCKET}/${IMAGE_PATH}`, BUCKET),
      IMAGE_PATH
    );
    assert.equal(
      adminBucketObjectPath(firebaseDownloadUrl('other.appspot.com', IMAGE_PATH), BUCKET),
      null
    );
    assert.equal(adminBucketObjectPath('https://fal.media/files/look.png', BUCKET), null);
  });
});

describe('pending coin metadata selection', () => {
  const now = 1_700_000_000_000;
  const fresh = now - 60_000;
  const liveUntil = now + 60_000;

  it('picks the newest upload with the same symbol', () => {
    const older = 'b'.repeat(32);
    const newer = 'c'.repeat(32);
    assert.equal(
      selectPendingCoinMetadataId(
        [
          { id: older, symbol: 'NOVA', createdAtMs: fresh - 1000, expireAtMs: liveUntil },
          { id: newer, symbol: 'NOVA', createdAtMs: fresh, expireAtMs: liveUntil },
          { id: METADATA_ID, symbol: 'DOGE', createdAtMs: fresh + 1, expireAtMs: liveUntil },
        ],
        'NOVA',
        now
      ),
      newer
    );
  });

  it('does not attach a different symbol when more than one upload is fresh', () => {
    assert.equal(
      selectPendingCoinMetadataId(
        [
          { id: METADATA_ID, symbol: 'NOVA', createdAtMs: fresh, expireAtMs: liveUntil },
          { id: 'b'.repeat(32), symbol: 'DOGE', createdAtMs: fresh, expireAtMs: liveUntil },
        ],
        'PEPE',
        now
      ),
      null
    );
  });

  it('ignores an upload past expireAt even when TTL has not deleted it', () => {
    const expired = 'b'.repeat(32);
    const stillLive = 'c'.repeat(32);
    assert.equal(
      selectPendingCoinMetadataId(
        [
          {
            id: expired,
            symbol: 'NOVA',
            createdAtMs: now - 1_000,
            expireAtMs: now - 1,
          },
          {
            id: stillLive,
            symbol: 'NOVA',
            createdAtMs: now - 120_000,
            expireAtMs: liveUntil,
          },
        ],
        'NOVA',
        now
      ),
      stillLive
    );
    assert.equal(
      selectPendingCoinMetadataId(
        [
          {
            id: METADATA_ID,
            symbol: 'NOVA',
            createdAtMs: now - 1_000,
            expireAtMs: now,
          },
        ],
        'NOVA',
        now
      ),
      null
    );
  });
});

describe('persistArtistPumpFun coin metadata', () => {
  it('stores the verified id and the bucket image path', async () => {
    const db = memoryDb(artist({ ownerId: UID }));
    const bucket = metadataBucket({
      uploadedBy: UID,
      image: firebaseDownloadUrl(BUCKET, IMAGE_PATH),
    });

    const result = await persistArtistPumpFun(launchInput({ coinMetadataId: METADATA_ID }), {
      db,
      bucket,
    });

    assert.equal(result.noop, false);
    assert.equal(result.coinMetadataId, METADATA_ID);
    assert.equal(result.coinImagePath, IMAGE_PATH);
    assert.equal(result.pumpFun.mint, launchInput().mint);
    assert.deepEqual(bucket.calls, [pumpFunMetadataObjectPath(METADATA_ID)]);
    assertStoredAtArtistRoot(db.writes[0], METADATA_ID, IMAGE_PATH);
  });

  it('stores a null image path when the coin image is not in our bucket', async () => {
    const db = memoryDb(artist({ ownerId: UID }));
    const bucket = metadataBucket({
      uploadedBy: UID,
      image: 'https://fal.media/files/look.png',
    });

    const result = await persistArtistPumpFun(launchInput({ coinMetadataId: METADATA_ID }), {
      db,
      bucket,
    });

    assert.equal(result.coinMetadataId, METADATA_ID);
    assert.equal(result.coinImagePath, null);
    assertStoredAtArtistRoot(db.writes[0], METADATA_ID, null);
  });

  it('rejects an id uploaded by someone else and does not write', async () => {
    const db = memoryDb(artist({ ownerId: UID }));
    const bucket = metadataBucket({
      uploadedBy: 'other-user',
      image: firebaseDownloadUrl(BUCKET, IMAGE_PATH),
    });

    await assert.rejects(
      () =>
        persistArtistPumpFun(launchInput({ coinMetadataId: METADATA_ID }), {
          db,
          bucket,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ArtistPumpFunPersistError);
        assert.equal(err.status, 403);
        return true;
      }
    );
    assert.equal(db.writes.length, 0);
    assert.deepEqual(bucket.calls, [pumpFunMetadataObjectPath(METADATA_ID)]);
  });

  it('rejects a missing metadata object for an explicit id', async () => {
    const db = memoryDb(artist({ ownerId: UID }));
    const bucket = metadataBucket({ missing: true });

    await assert.rejects(
      () =>
        persistArtistPumpFun(launchInput({ coinMetadataId: METADATA_ID }), {
          db,
          bucket,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ArtistPumpFunPersistError);
        assert.equal(err.status, 404);
        return true;
      }
    );
    assert.equal(db.writes.length, 0);
  });

  it('does not open a client-supplied path', async () => {
    const db = memoryDb(artist({ ownerId: UID }));
    const bucket = metadataBucket({ uploadedBy: UID, image: IMAGE_PATH });

    await assert.rejects(
      () =>
        persistArtistPumpFun(
          launchInput({ coinMetadataId: `c/${METADATA_ID}.json` }),
          { db, bucket }
        ),
      (err: unknown) => {
        assert.ok(err instanceof ArtistPumpFunPersistError);
        assert.equal(err.status, 400);
        return true;
      }
    );
    assert.deepEqual(bucket.calls, []);
    assert.equal(db.writes.length, 0);
  });

  it('derives the id from the metadata URI when the client omits it', async () => {
    const db = memoryDb(artist({ ownerId: UID }));
    const bucket = metadataBucket({
      uploadedBy: UID,
      image: `https://storage.googleapis.com/${BUCKET}/${IMAGE_PATH}`,
    });

    const result = await persistArtistPumpFun(
      launchInput({ metadataUri: `https://www.streamstar.xyz/c/${METADATA_ID}` }),
      { db, bucket }
    );

    assert.equal(result.coinMetadataId, METADATA_ID);
    assert.equal(result.coinImagePath, IMAGE_PATH);
    assert.deepEqual(bucket.calls, [pumpFunMetadataObjectPath(METADATA_ID)]);
    assertStoredAtArtistRoot(db.writes[0], METADATA_ID, IMAGE_PATH);
  });

  it('still saves the coin when an older client sends no id and no URI', async () => {
    const db = memoryDb(artist({ ownerId: UID }));
    const bucket = metadataBucket({ uploadedBy: UID });

    const result = await persistArtistPumpFun(launchInput(), { db, bucket });

    assert.equal(result.noop, false);
    assert.equal(result.pumpFun.mint, launchInput().mint);
    assert.equal(result.coinMetadataId, null);
    assert.equal(result.coinImagePath, null);
    assert.equal(Object.hasOwn(db.writes[0] ?? {}, 'coinMetadataId'), false);
    assert.equal(Object.hasOwn(result.pumpFun, 'coinMetadataId'), false);
    assert.deepEqual(bucket.calls, []);
    assert.equal(db.writes.length, 1);
  });

  it('skips an unverified metadata URI and still saves the coin', async () => {
    const db = memoryDb(artist({ ownerId: UID }));
    const bucket = metadataBucket({
      uploadedBy: 'other-user',
      image: firebaseDownloadUrl(BUCKET, IMAGE_PATH),
    });

    const result = await persistArtistPumpFun(
      launchInput({ metadataUri: `https://www.streamstar.xyz/c/${METADATA_ID}` }),
      { db, bucket }
    );

    assert.equal(result.coinMetadataId, null);
    assert.equal(result.pumpFun.mint, launchInput().mint);
    assert.equal(Object.hasOwn(db.writes[0] ?? {}, 'coinMetadataId'), false);
    assert.equal(db.writes.length, 1);
  });

  it('backfills the id onto a coin that was saved without one', async () => {
    const db = memoryDb(
      artist({
        ownerId: UID,
        pumpFun: {
          mint: launchInput().mint,
          url: launchInput().url,
          symbol: 'NOVA',
          launchedAt: null,
          creatorWallet: launchInput().creatorWallet,
        },
      })
    );
    const bucket = metadataBucket({
      uploadedBy: UID,
      image: firebaseDownloadUrl(BUCKET, IMAGE_PATH),
    });

    const result = await persistArtistPumpFun(launchInput({ coinMetadataId: METADATA_ID }), {
      db,
      bucket,
    });

    assert.equal(result.noop, false);
    assert.equal(result.pumpFun.mint, launchInput().mint);
    assert.equal(result.pumpFun.symbol, 'NOVA');
    assert.equal(result.coinMetadataId, METADATA_ID);
    assert.equal(result.coinImagePath, IMAGE_PATH);
    assertStoredAtArtistRoot(db.writes[0], METADATA_ID, IMAGE_PATH);
    assert.equal(Object.hasOwn(db.writes[0] ?? {}, 'pumpFun'), false);
  });

  it('does not replace metadata already stored for this mint', async () => {
    const db = memoryDb(
      artist({
        ownerId: UID,
        pumpFun: {
          mint: launchInput().mint,
          url: launchInput().url,
          symbol: 'NOVA',
          launchedAt: null,
          creatorWallet: launchInput().creatorWallet,
        },
        coinMetadataId: 'c'.repeat(32),
        coinImagePath: 'artist-looks/user-1/original.jpg',
      })
    );
    const bucket = metadataBucket({
      uploadedBy: UID,
      image: firebaseDownloadUrl(BUCKET, IMAGE_PATH),
    });

    const result = await persistArtistPumpFun(launchInput({ coinMetadataId: METADATA_ID }), {
      db,
      bucket,
    });

    assert.equal(result.noop, true);
    assert.equal(result.coinMetadataId, 'c'.repeat(32));
    assert.equal(result.coinImagePath, 'artist-looks/user-1/original.jpg');
    assert.equal(result.pumpFun.mint, launchInput().mint);
    assert.equal(db.writes.length, 0);
  });

  it('links a remembered upload when confirm omits the id and any metadata URI', async () => {
    const db = memoryDb(artist({ ownerId: UID }));
    const bucket = metadataBucket({
      uploadedBy: UID,
      image: firebaseDownloadUrl(BUCKET, IMAGE_PATH),
    });

    const result = await persistArtistPumpFun(launchInput(), {
      db,
      bucket,
      lookupMetadataId: async ({ userId, symbol }) => {
        assert.equal(userId, UID);
        assert.equal(symbol, 'NOVA');
        return METADATA_ID;
      },
    });

    assert.equal(result.coinMetadataId, METADATA_ID);
    assert.equal(result.coinImagePath, IMAGE_PATH);
    assert.equal(result.pumpFun.mint, launchInput().mint);
    assertStoredAtArtistRoot(db.writes[0], METADATA_ID, IMAGE_PATH);
  });

  it('does not link a remembered upload that this user did not upload', async () => {
    const db = memoryDb(artist({ ownerId: UID }));
    const bucket = metadataBucket({
      uploadedBy: 'other-user',
      image: firebaseDownloadUrl(BUCKET, IMAGE_PATH),
    });

    const result = await persistArtistPumpFun(launchInput(), {
      db,
      bucket,
      lookupMetadataId: async () => METADATA_ID,
    });

    assert.equal(result.coinMetadataId, null);
    assert.equal(result.pumpFun.mint, launchInput().mint);
    assert.equal(Object.hasOwn(db.writes[0] ?? {}, 'coinMetadataId'), false);
    assert.equal(db.writes.length, 1);
  });

  it('keeps the artist owner check', async () => {
    const db = memoryDb(artist({ ownerId: 'someone-else' }));
    const bucket = metadataBucket({ uploadedBy: UID });

    await assert.rejects(
      () => persistArtistPumpFun(launchInput(), { db, bucket }),
      (err: unknown) => {
        assert.ok(err instanceof ArtistPumpFunPersistError);
        assert.equal(err.status, 403);
        assert.match(err.message, /owner/i);
        return true;
      }
    );
    assert.equal(db.writes.length, 0);
    assert.deepEqual(bucket.calls, []);
  });
});
