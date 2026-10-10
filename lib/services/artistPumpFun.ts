/**
 * Owner-only persist of a confirmed pump.fun coin onto an existing artist.
 * Admin SDK so the write succeeds after the wallet-signed tx confirms.
 * Never writes empty pumpFun over a live mint.
 *
 * coinMetadataId and coinImagePath are written on the artist document root
 * (not inside pumpFun). mint stays at pumpFun.mint. The id is accepted only
 * when `c/{id}.json` exists and Storage custom metadata `uploadedBy` is this
 * uid. The image path is read from that object's JSON. A client path is never
 * stored. When confirm omits the id, a metadata URI is used if present;
 * otherwise the id remembered from this uid's metadata upload is used.
 */

import { FieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { getAdminBucket, getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { hasLaunchedCoin } from '@/lib/brand/coin';
import {
  findPendingCoinMetadataId,
  forgetCoinMetadataUpload,
} from '@/lib/services/coinMetadataPending';
import {
  adminBucketObjectPath,
  coinMetadataIdFromUri,
  coinMetadataObjectPathForId,
} from '@/lib/solana/coinMetadata';
import { isValidPumpFunMetadataId } from '@/lib/solana/pumpFun';
import type { AIArtistDocument, PumpFunCoin } from '@/types/firestore';
import type { Timestamp } from 'firebase/firestore';

export class ArtistPumpFunPersistError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export type PersistArtistPumpFunInput = {
  artistId: string;
  userId: string;
  mint: string;
  url: string;
  symbol: string;
  launchedAtMs: number;
  creatorWallet: string;
  /** `{id}` of `c/{id}.json` from the metadata route. Optional for older clients. */
  coinMetadataId?: string | null;
  /** Public metadata URI. Used only when coinMetadataId is omitted. */
  metadataUri?: string | null;
};

export type PersistArtistPumpFunResult = {
  pumpFun: PumpFunCoin;
  /** Artist document root. Null when this launch did not link metadata. */
  coinMetadataId: string | null;
  /** Artist document root. Null when the image is not in our bucket, or when unset. */
  coinImagePath: string | null;
  noop: boolean;
};

export type CoinMetadataStorageFile = {
  getMetadata: () => Promise<[{ metadata?: Record<string, unknown> | null }?]>;
  download: () => Promise<[Buffer]>;
};

export type CoinMetadataBucket = {
  name?: string;
  file: (objectPath: string) => CoinMetadataStorageFile;
};

export type PersistArtistPumpFunDeps = {
  db?: ArtistDb;
  bucket?: CoinMetadataBucket;
  /** When set, used instead of coinMetadataUploads/{uid}/coinUploads. */
  lookupMetadataId?: (input: { userId: string; symbol: string }) => Promise<string | null>;
  forgetMetadataId?: (id: string) => Promise<void>;
};

type ArtistSnap = {
  exists: boolean;
  data: () => AIArtistDocument | undefined;
};

type ArtistTx = {
  get: (ref: { id: string }) => Promise<ArtistSnap>;
  set: (
    ref: { id: string },
    data: Record<string, unknown>,
    options?: { merge?: boolean }
  ) => void;
};

type ArtistDb = {
  collection: (name: string) => { doc: (id: string) => { id: string } };
  runTransaction: <T>(fn: (tx: ArtistTx) => Promise<T>) => Promise<T>;
};

export type ResolvedCoinMetadata = {
  coinMetadataId: string;
  coinImagePath: string | null;
};

function existingMint(pumpFun?: PumpFunCoin | null): string | null {
  const mint = pumpFun?.mint?.trim();
  return mint || null;
}

function isStorageNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === 404 || code === '404';
}

function isBucketConfigError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /bucket name not specified|Firebase Admin not initialized/i.test(message);
}

function imagePathFromMetadataJson(buf: Buffer, bucketName: string): string | null {
  const parsed: unknown = JSON.parse(buf.toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const image = (parsed as { image?: unknown }).image;
  if (typeof image !== 'string') return null;
  return adminBucketObjectPath(image, bucketName);
}

/**
 * Resolve coinMetadataId + coinImagePath for a launch write.
 * An explicit id that is missing or uploaded by someone else is rejected.
 * A metadata URI that cannot be verified is skipped (returns null) so an
 * older client can still save the coin.
 */
export async function resolveOwnedCoinMetadata(input: {
  userId: string;
  coinMetadataId?: string | null;
  metadataUri?: string | null;
  /** Id remembered from this uid's metadata upload. Failure skips, it does not reject. */
  rememberedId?: string | null;
  bucket: CoinMetadataBucket;
}): Promise<ResolvedCoinMetadata | null> {
  const explicit = input.coinMetadataId?.trim() ?? '';
  const uri = input.metadataUri?.trim() ?? '';
  const remembered = input.rememberedId?.trim() ?? '';

  let id: string;
  let strict: boolean;
  if (explicit) {
    if (!isValidPumpFunMetadataId(explicit)) {
      throw new ArtistPumpFunPersistError(400, 'Invalid coin metadata id.');
    }
    id = explicit;
    strict = true;
  } else if (uri) {
    const derived = coinMetadataIdFromUri(uri);
    if (!derived) return null;
    id = derived;
    strict = false;
  } else if (remembered) {
    if (!isValidPumpFunMetadataId(remembered)) return null;
    id = remembered;
    strict = false;
  } else {
    return null;
  }

  const objectPath = coinMetadataObjectPathForId(id);
  if (!objectPath) {
    if (!strict) return null;
    throw new ArtistPumpFunPersistError(400, 'Invalid coin metadata id.');
  }

  const bucketName = input.bucket.name?.trim() ?? '';
  if (!bucketName) {
    if (!strict) return null;
    throw new ArtistPumpFunPersistError(503, 'Storage is temporarily unavailable.');
  }

  const file = input.bucket.file(objectPath);
  let uploadedBy: unknown;
  try {
    const [metadata] = await file.getMetadata();
    uploadedBy = metadata?.metadata?.uploadedBy;
  } catch (err) {
    if (isStorageNotFound(err)) {
      if (!strict) return null;
      throw new ArtistPumpFunPersistError(404, 'Coin metadata was not found.');
    }
    if (isBucketConfigError(err)) {
      if (!strict) return null;
      throw new ArtistPumpFunPersistError(503, 'Storage is temporarily unavailable.');
    }
    throw err;
  }

  if (typeof uploadedBy !== 'string' || uploadedBy !== input.userId) {
    if (!strict) return null;
    throw new ArtistPumpFunPersistError(
      403,
      'Coin metadata was not uploaded by this account.'
    );
  }

  let coinImagePath: string | null = null;
  try {
    const [buf] = await file.download();
    coinImagePath = imagePathFromMetadataJson(buf, bucketName);
  } catch (err) {
    if (isStorageNotFound(err) || err instanceof SyntaxError) {
      coinImagePath = null;
    } else if (isBucketConfigError(err)) {
      if (!strict) return null;
      throw new ArtistPumpFunPersistError(503, 'Storage is temporarily unavailable.');
    } else {
      throw err;
    }
  }

  return { coinMetadataId: id, coinImagePath };
}

function linkedCoinMetadata(artist: AIArtistDocument): {
  coinMetadataId: string | null;
  coinImagePath: string | null;
} {
  const coinMetadataId = artist.coinMetadataId?.trim() || null;
  return {
    coinMetadataId,
    coinImagePath: coinMetadataId ? (artist.coinImagePath ?? null) : null,
  };
}

/**
 * Persist mint+url+symbol+launchedAt+creatorWallet on an existing artist.
 * Owner-only. Also writes coinMetadataId and coinImagePath on the artist
 * document root when this user uploaded `c/{id}.json`. No-ops when the same
 * mint is already stored and the root id is already set. Rejects when a
 * different mint exists. Never writes empty pumpFun over a live coin.
 */
export async function persistArtistPumpFun(
  input: PersistArtistPumpFunInput,
  deps?: PersistArtistPumpFunDeps
): Promise<PersistArtistPumpFunResult> {
  const mint = input.mint.trim();
  const url = input.url.trim();
  const symbol = input.symbol.trim();
  const creatorWallet = input.creatorWallet.trim();

  if (!mint || !url || !symbol || !creatorWallet) {
    throw new ArtistPumpFunPersistError(
      400,
      'mint, url, symbol, and creatorWallet are required.'
    );
  }

  const requestedId = input.coinMetadataId?.trim() ?? '';
  const metadataUri = input.metadataUri?.trim() ?? '';
  let rememberedId: string | null = null;
  if (!requestedId && !metadataUri && (!deps || deps.lookupMetadataId)) {
    try {
      rememberedId = deps?.lookupMetadataId
        ? await deps.lookupMetadataId({ userId: input.userId, symbol })
        : await findPendingCoinMetadataId(input.userId, symbol);
    } catch (err) {
      console.error('[pump.fun] pending coin metadata lookup failed', err);
      rememberedId = null;
    }
  }

  let resolved: ResolvedCoinMetadata | null = null;
  if (requestedId || metadataUri || rememberedId) {
    try {
      const bucket = (deps?.bucket ?? getAdminBucket()) as CoinMetadataBucket;
      resolved = await resolveOwnedCoinMetadata({
        userId: input.userId,
        coinMetadataId: requestedId || null,
        metadataUri: metadataUri || null,
        rememberedId,
        bucket,
      });
    } catch (err) {
      if (!requestedId) {
        resolved = null;
      } else {
        throw err;
      }
    }
  }

  const db = (deps?.db ?? getAdminDb()) as ArtistDb;
  const ref = db.collection(COLLECTIONS.artists).doc(input.artistId);

  const result = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new ArtistPumpFunPersistError(404, 'Artist not found');
    }

    const artist = snap.data() as AIArtistDocument;
    if (artist.deletedAt) {
      throw new ArtistPumpFunPersistError(404, 'Artist not found');
    }
    if (artist.ownerId !== input.userId) {
      throw new ArtistPumpFunPersistError(403, 'Only the owner can launch a coin');
    }

    const storedMint = existingMint(artist.pumpFun);
    if (storedMint || hasLaunchedCoin(artist.pumpFun)) {
      if (storedMint === mint) {
        const linked = linkedCoinMetadata(artist);
        if (linked.coinMetadataId || !resolved) {
          return {
            pumpFun: artist.pumpFun as PumpFunCoin,
            coinMetadataId: linked.coinMetadataId,
            coinImagePath: linked.coinImagePath,
            noop: true,
          };
        }
        tx.set(
          ref,
          {
            coinMetadataId: resolved.coinMetadataId,
            coinImagePath: resolved.coinImagePath,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        return {
          pumpFun: artist.pumpFun as PumpFunCoin,
          coinMetadataId: resolved.coinMetadataId,
          coinImagePath: resolved.coinImagePath,
          noop: false,
        };
      }
      throw new ArtistPumpFunPersistError(409, 'This artist already has a coin.');
    }

    const pumpFun: PumpFunCoin = {
      mint,
      url,
      symbol,
      launchedAt: AdminTimestamp.fromMillis(input.launchedAtMs) as unknown as Timestamp,
      creatorWallet,
    };

    tx.set(
      ref,
      {
        pumpFun,
        ...(resolved
          ? {
              coinMetadataId: resolved.coinMetadataId,
              coinImagePath: resolved.coinImagePath,
            }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      pumpFun,
      coinMetadataId: resolved?.coinMetadataId ?? null,
      coinImagePath: resolved?.coinImagePath ?? null,
      noop: false,
    };
  });

  if (!result.noop && result.coinMetadataId) {
    const forget = deps?.forgetMetadataId
      ? deps.forgetMetadataId
      : deps
        ? null
        : (id: string) => forgetCoinMetadataUpload(input.userId, id);
    if (forget) {
      try {
        await forget(result.coinMetadataId);
      } catch (err) {
        console.error('[pump.fun] could not clear pending coin metadata id', err);
      }
    }
  }

  return result;
}
