/**
 * Owner-only persist of a confirmed pump.fun coin onto an existing artist.
 * Admin SDK so the write succeeds after the wallet-signed tx confirms.
 * Never writes empty pumpFun over a live mint.
 *
 * coinMetadataId and coinImagePath are written on the artist document root
 * (not inside pumpFun). mint stays at pumpFun.mint. The id is stored only
 * when `c/{id}.json` exists and Storage custom metadata `uploadedBy` is this
 * uid. The image path is read from that object's JSON. A client path is never
 * stored. A missing object, a storage error, a timeout, a malformed explicit
 * id, `uploadedBy` for a different uid, or any other failure to verify the id
 * still saves the coin without those fields and logs `coin_metadata_unverified`
 * with the artist id and a reason, never a uid. A different uploader is
 * `foreign_uploader` for an explicit id, a URI-derived id, and an id remembered
 * from this uid's metadata upload. A malformed explicit id is `invalid_id`.
 * Metadata never rejects the write. When confirm omits the id, a metadata URI
 * is used if present; otherwise the remembered id is used.
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

function errorCode(err: unknown): unknown {
  if (!err || typeof err !== 'object') return undefined;
  return (err as { code?: unknown }).code;
}

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const record = err as { name?: unknown; code?: unknown; message?: unknown };
  if (record.name === 'AbortError' || record.name === 'TimeoutError') return true;
  const code = record.code;
  if (
    code === 'ETIMEDOUT' ||
    code === 'ECONNABORTED' ||
    code === 'DEADLINE_EXCEEDED' ||
    code === 'deadline-exceeded' ||
    code === 408 ||
    code === '408' ||
    code === 504 ||
    code === '504'
  ) {
    return true;
  }
  const message = typeof record.message === 'string' ? record.message : '';
  return /timeout|timed out|deadline exceeded/i.test(message);
}

function isServerStorageError(err: unknown): boolean {
  const code = errorCode(err);
  if (typeof code === 'number' && code >= 500 && code <= 599) return true;
  return typeof code === 'string' && /^5\d\d$/.test(code);
}

function isNetworkError(err: unknown): boolean {
  const code = errorCode(err);
  return (
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ECONNREFUSED' ||
    code === 'ENETUNREACH' ||
    code === 'EPIPE'
  );
}

/** Reason token for `coin_metadata_unverified`. Never includes a uid. */
function coinMetadataFailureReason(err: unknown): string {
  if (isStorageNotFound(err)) return 'not_found';
  if (isTimeoutError(err)) return 'timeout';
  if (isBucketConfigError(err)) return 'unavailable';
  if (isServerStorageError(err)) return 'storage_error';
  if (isNetworkError(err)) return 'network';
  return 'unverified';
}

function logCoinMetadataUnverified(artistId: string, reason: string): void {
  console.info('coin_metadata_unverified', { artistId, reason });
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
 * Returns null when there is nothing to link. A missing object, a storage
 * error, a timeout, a malformed explicit id, a different `uploadedBy`, or any
 * other failure also returns null after logging `coin_metadata_unverified`.
 * The log is `{artistId, reason}` and never includes a uid. A different
 * uploader uses `foreign_uploader`. A malformed explicit id uses `invalid_id`
 * and does not open the object.
 */
export async function resolveOwnedCoinMetadata(input: {
  artistId: string;
  userId: string;
  coinMetadataId?: string | null;
  metadataUri?: string | null;
  /** Id remembered from this uid's metadata upload. */
  rememberedId?: string | null;
  bucket: CoinMetadataBucket;
}): Promise<ResolvedCoinMetadata | null> {
  const explicit = input.coinMetadataId?.trim() ?? '';
  const uri = input.metadataUri?.trim() ?? '';
  const remembered = input.rememberedId?.trim() ?? '';

  let id = '';
  if (explicit) {
    if (!isValidPumpFunMetadataId(explicit)) {
      logCoinMetadataUnverified(input.artistId, 'invalid_id');
      return null;
    }
    id = explicit;
  } else if (uri) {
    const derived = coinMetadataIdFromUri(uri);
    if (!derived) return null;
    id = derived;
  } else if (remembered) {
    if (!isValidPumpFunMetadataId(remembered)) return null;
    id = remembered;
  } else {
    return null;
  }

  const objectPath = coinMetadataObjectPathForId(id);
  if (!objectPath) {
    logCoinMetadataUnverified(input.artistId, explicit ? 'invalid_id' : 'unverified');
    return null;
  }

  const bucketName = input.bucket.name?.trim() ?? '';
  if (!bucketName) {
    logCoinMetadataUnverified(input.artistId, 'unavailable');
    return null;
  }

  const file = input.bucket.file(objectPath);
  let uploadedBy: unknown;
  try {
    const [metadata] = await file.getMetadata();
    uploadedBy = metadata?.metadata?.uploadedBy;
  } catch (err) {
    logCoinMetadataUnverified(input.artistId, coinMetadataFailureReason(err));
    return null;
  }

  // A different account drops the metadata fields. The coin is still saved.
  if (typeof uploadedBy === 'string' && uploadedBy.length > 0 && uploadedBy !== input.userId) {
    logCoinMetadataUnverified(input.artistId, 'foreign_uploader');
    return null;
  }
  if (uploadedBy !== input.userId) {
    logCoinMetadataUnverified(input.artistId, 'unverified');
    return null;
  }

  let coinImagePath: string | null = null;
  try {
    const [buf] = await file.download();
    coinImagePath = imagePathFromMetadataJson(buf, bucketName);
  } catch {
    // Ownership is already verified. Keep the id and leave the image unset.
    coinImagePath = null;
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
 * An unverifiable metadata id, including a different `uploadedBy` or a
 * malformed explicit id, is omitted and the coin is still saved.
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
        artistId: input.artistId,
        userId: input.userId,
        coinMetadataId: requestedId || null,
        metadataUri: metadataUri || null,
        rememberedId,
        bucket,
      });
    } catch (err) {
      // Metadata never rejects a confirmed coin. Owner and mint checks run later.
      logCoinMetadataUnverified(input.artistId, coinMetadataFailureReason(err));
      resolved = null;
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
