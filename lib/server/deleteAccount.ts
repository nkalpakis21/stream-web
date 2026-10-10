/**
 * Hard-delete one account. Firestore first, Firebase Auth last.
 * Idempotent: a retry after a partial failure deletes whatever is left.
 */

import * as admin from 'firebase-admin';
import type {
  BulkWriter,
  Firestore,
  Query,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { getAdminBucket, getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

type CoinFile = ReturnType<ReturnType<typeof getAdminBucket>['file']>;

const PAGE_SIZE = 400;
const IN_LIMIT = 30;

const COIN_OBJECT_PATH = /^c\/[0-9a-f]{32}\.json$/;

function firebaseErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const record = err as { code?: unknown; errorInfo?: { code?: unknown } };
  if (typeof record.code === 'string') return record.code;
  if (typeof record.errorInfo?.code === 'string') return record.errorInfo.code;
  return null;
}

export function isAuthUserNotFound(err: unknown): boolean {
  return firebaseErrorCode(err) === 'auth/user-not-found';
}

function bucketNotConfigured(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /bucket name not specified/i.test(message);
}

export function collectEmails(
  ...values: Array<string | null | undefined>
): string[] {
  const emails: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || !value.includes('@')) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(value);
  }
  return emails;
}

export function isPersonalValue(
  value: string,
  uid: string,
  emails: readonly string[]
): boolean {
  if (value === uid) return true;
  const lower = value.toLowerCase();
  return emails.some(email => email.toLowerCase() === lower);
}

/** Drop object fields and array entries whose string value is this user's uid or email. */
export function stripPersonalFields(
  value: unknown,
  uid: string,
  emails: readonly string[]
): { value: unknown; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false;
    const next: unknown[] = [];
    for (const item of value) {
      if (typeof item === 'string' && isPersonalValue(item, uid, emails)) {
        changed = true;
        continue;
      }
      const child = stripPersonalFields(item, uid, emails);
      if (child.changed) changed = true;
      next.push(child.value);
    }
    return { value: changed ? next : value, changed };
  }

  if (value && typeof value === 'object') {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (typeof child === 'string' && isPersonalValue(child, uid, emails)) {
        changed = true;
        continue;
      }
      const nested = stripPersonalFields(child, uid, emails);
      if (nested.changed) changed = true;
      next[key] = nested.value;
    }
    return { value: changed ? next : value, changed };
  }

  return { value, changed: false };
}

async function mapPage(
  build: (cursor?: QueryDocumentSnapshot) => Query,
  onPage: (docs: QueryDocumentSnapshot[]) => Promise<void>
): Promise<void> {
  let cursor: QueryDocumentSnapshot | undefined;
  for (;;) {
    const snap = await build(cursor).get();
    if (snap.empty) return;
    await onPage(snap.docs);
    const last = snap.docs[snap.docs.length - 1];
    if (cursor && last.id === cursor.id) {
      throw Object.assign(new Error('delete-failed'), { code: 'delete-failed' });
    }
    if (snap.size < PAGE_SIZE) return;
    cursor = last;
  }
}

/** Plain Firestore maps only. Skips Timestamp class instances. */
export function walkStrings(value: unknown, sink: string[]): void {
  if (typeof value === 'string') {
    sink.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkStrings(item, sink);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return;
  for (const child of Object.values(value as Record<string, unknown>)) {
    walkStrings(child, sink);
  }
}

function cleanObjectPath(raw: string): string | null {
  if (!raw) return null;
  let path = raw;
  try {
    path = decodeURIComponent(raw.replace(/\+/g, '%20'));
  } catch {
    return null;
  }
  path = path.replace(/^\/+/, '');
  if (!path || path.includes('..') || path.includes('\\') || path.includes('\0')) return null;
  if (path.endsWith('/')) return null;
  return path;
}

/**
 * Object path in our bucket, or null for every other URL.
 * Only these two forms match, and the bucket segment must be the Admin bucket:
 * 1. https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<url-encoded path>
 * 2. https://storage.googleapis.com/<bucket>/<path>
 * Other buckets, gs://, MusicGPT, Fal, and any other host are skipped.
 */
export function firebaseStorageObjectPath(url: string, bucketName: string): string | null {
  const bucket = bucketName.trim();
  const trimmed = url.trim();
  if (!bucket || !trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase();

  if (host === 'firebasestorage.googleapis.com') {
    const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!match) return null;
    let named: string;
    try {
      named = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
    if (named !== bucket) return null;
    return cleanObjectPath(match[2]);
  }

  if (host === 'storage.googleapis.com') {
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    let named: string;
    try {
      named = decodeURIComponent(parts[0]);
    } catch {
      return null;
    }
    if (named !== bucket) return null;
    return cleanObjectPath(parts.slice(1).join('/'));
  }

  return null;
}

const COIN_ID_FIELDS = new Set(['coinId', 'metadataId', 'metadataUri', 'uri']);

/**
 * Storage paths for coins this account's artist docs actually point at.
 * Matches a metadata URI (`/c/{id}`), an object path (`c/{id}.json`), or a
 * 32-hex id stored on coinId / metadataId / metadataUri / uri.
 * An artist that only has mint and a pump.fun URL yields nothing.
 */
export function coinMetadataObjectPaths(value: unknown): string[] {
  const paths = new Set<string>();
  walkCoinRefs(value, null, paths);
  return [...paths];
}

function addCoinId(id: string, paths: Set<string>): void {
  if (/^[0-9a-f]{32}$/.test(id)) paths.add(`c/${id}.json`);
}

function walkCoinRefs(value: unknown, key: string | null, paths: Set<string>): void {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const asPath = trimmed.match(/^c\/([0-9a-f]{32})\.json$/);
    if (asPath) {
      addCoinId(asPath[1], paths);
      return;
    }
    try {
      const url = new URL(trimmed);
      const match = url.pathname.match(/^\/c\/([0-9a-f]{32})(?:\.json)?$/);
      if (match) {
        addCoinId(match[1], paths);
        return;
      }
    } catch {
      // Not a URL. A bare id only counts on a coin field.
    }
    if (key && COIN_ID_FIELDS.has(key) && /^[0-9a-f]{32}$/.test(trimmed)) {
      addCoinId(trimmed, paths);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkCoinRefs(item, key, paths);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return;
  for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
    walkCoinRefs(child, childKey, paths);
  }
}

async function collectIds(
  db: Firestore,
  collectionName: string,
  field: string,
  value: string,
  sink?: string[],
  onDoc?: (data: unknown) => void
): Promise<string[]> {
  const ids: string[] = [];
  await mapPage(
    cursor => {
      let query = db.collection(collectionName).where(field, '==', value).limit(PAGE_SIZE);
      if (cursor) query = query.startAfter(cursor);
      return query;
    },
    async docs => {
      for (const doc of docs) {
        ids.push(doc.id);
        const data = doc.data();
        if (sink) walkStrings(data, sink);
        if (onDoc) onDoc(data);
      }
    }
  );
  return ids;
}

async function collectWhereIn(
  db: Firestore,
  collectionName: string,
  field: string,
  values: readonly string[],
  sink?: string[]
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < values.length; i += IN_LIMIT) {
    const chunk = values.slice(i, i + IN_LIMIT);
    if (chunk.length === 0) continue;
    await mapPage(
      cursor => {
        let query = db
          .collection(collectionName)
          .where(field, 'in', chunk)
          .limit(PAGE_SIZE);
        if (cursor) query = query.startAfter(cursor);
        return query;
      },
      async docs => {
        for (const doc of docs) {
          ids.push(doc.id);
          if (sink) walkStrings(doc.data(), sink);
        }
      }
    );
  }
  return ids;
}

function isStorageNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === 404 || code === '404';
}

async function deletePrefixExcept(
  bucket: ReturnType<typeof getAdminBucket>,
  prefix: string,
  keep: ReadonlySet<string>
): Promise<void> {
  const keptHere = [...keep].some(path => path.startsWith(prefix));
  if (!keptHere) {
    try {
      await bucket.deleteFiles({ prefix });
      return;
    } catch (err) {
      // A missing object is success. Finish the rest of the prefix so
      // one 404 does not leave the remaining files public.
      if (!isStorageNotFound(err)) throw err;
    }
  }

  let pageToken: string | undefined;
  do {
    const [files, next] = await bucket.getFiles({
      prefix,
      autoPaginate: false,
      maxResults: 100,
      pageToken,
    });
    if (files.length === 0) break;
    await Promise.all(
      files.map(async file => {
        if (keep.has(file.name) || file.name.startsWith('c/')) return;
        await file.delete({ ignoreNotFound: true });
      })
    );
    const nextToken = next?.pageToken;
    if (!nextToken || nextToken === pageToken) break;
    pageToken = nextToken;
  } while (pageToken);
}

async function collectKeptCoinImagePaths(
  bucket: ReturnType<typeof getAdminBucket>,
  uid: string,
  emails: readonly string[],
  songIds: readonly string[],
  coinPaths: readonly string[]
): Promise<Set<string>> {
  const keep = new Set<string>();
  const songPrefixes = songIds.map(id => `songs/${id}/`);
  const bucketName = bucket.name;
  if (!bucketName || coinPaths.length === 0) return keep;

  for (const objectPath of coinPaths) {
    if (!COIN_OBJECT_PATH.test(objectPath)) continue;
    const file = bucket.file(objectPath);
    let uploadedBy: unknown;
    try {
      const [metadata] = await file.getMetadata();
      uploadedBy = metadata.metadata?.uploadedBy;
    } catch (err) {
      if (isStorageNotFound(err)) continue;
      throw err;
    }
    const owned =
      typeof uploadedBy === 'string' && isPersonalValue(uploadedBy, uid, emails);
    const unmarked = typeof uploadedBy !== 'string' || uploadedBy.length === 0;
    if (!owned && !unmarked) continue;

    let imagePath: string | null = null;
    try {
      const [buf] = await file.download();
      const parsed: unknown = JSON.parse(buf.toString('utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const image = (parsed as { image?: unknown }).image;
        if (typeof image === 'string') {
          imagePath = firebaseStorageObjectPath(image, bucketName);
        }
      }
    } catch (err) {
      if (isStorageNotFound(err) || err instanceof SyntaxError) {
        console.error('[account] coin metadata image left unresolved', objectPath);
        continue;
      }
      throw err;
    }
    if (!imagePath || imagePath.startsWith('c/')) continue;
    const underOwned =
      imagePath.startsWith(`artist-looks/${uid}/`) ||
      songPrefixes.some(songPrefix => imagePath.startsWith(songPrefix));
    if (owned || underOwned) keep.add(imagePath);
  }

  return keep;
}

/**
 * Delete this account's Storage objects before Firestore docs are removed.
 * c/{id}.json and the object its image field points at are kept.
 * External URLs are ignored.
 */
async function deleteAccountStorage(input: {
  uid: string;
  emails: readonly string[];
  songIds: readonly string[];
  docStrings: readonly string[];
  coinPaths: readonly string[];
}): Promise<void> {
  let bucket;
  try {
    bucket = getAdminBucket();
  } catch (err) {
    if (bucketNotConfigured(err)) return;
    throw err;
  }
  if (!bucket.name) return;

  const keep = await collectKeptCoinImagePaths(
    bucket,
    input.uid,
    input.emails,
    input.songIds,
    input.coinPaths
  );

  await deletePrefixExcept(bucket, `artist-looks/${input.uid}/`, keep);
  for (const songId of input.songIds) {
    await deletePrefixExcept(bucket, `songs/${songId}/`, keep);
  }

  const seen = new Set<string>();
  for (const value of input.docStrings) {
    const path = firebaseStorageObjectPath(value, bucket.name);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    if (path.startsWith('c/') || keep.has(path)) continue;
    // Owned look and song prefixes are already removed. Never delete
    // another account's artist-looks/ or songs/ objects.
    if (path.startsWith('artist-looks/') || path.startsWith('songs/')) continue;
    try {
      await bucket.file(path).delete({ ignoreNotFound: true });
    } catch (err) {
      if (isStorageNotFound(err)) continue;
      throw err;
    }
  }
}

/**
 * Queue every delete, flush, then await. Awaiting the BulkWriter promises
 * before flush() deadlocks when a batch has fewer than 20 writes: those
 * promises resolve only once the batch is sent.
 * Promise.all stays. A failed write rejects its own promise. close() does not.
 */
export async function commitBulkDeletes<T>(
  writer: {
    delete: (ref: T) => Promise<unknown>;
    flush: () => Promise<unknown>;
  },
  refs: readonly T[]
): Promise<void> {
  const ops = refs.map(ref => writer.delete(ref));
  await writer.flush();
  await Promise.all(ops);
}

async function deleteDocIds(
  db: Firestore,
  writer: BulkWriter,
  collectionName: string,
  ids: readonly string[]
): Promise<void> {
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += PAGE_SIZE) {
    const refs = unique
      .slice(i, i + PAGE_SIZE)
      .map(id => db.collection(collectionName).doc(id));
    await commitBulkDeletes(writer, refs);
  }
}

async function stripCoinFile(
  file: CoinFile,
  uid: string,
  emails: readonly string[]
): Promise<void> {
  if (!COIN_OBJECT_PATH.test(file.name)) return;

  const [metadata] = await file.getMetadata();
  const custom = metadata.metadata ?? {};
  const personalKeys: string[] = [];
  for (const [key, value] of Object.entries(custom)) {
    if (typeof value === 'string' && isPersonalValue(value, uid, emails)) {
      personalKeys.push(key);
    }
  }
  if (personalKeys.length === 0) return;

  let rewritten: Buffer | null = null;
  try {
    const [buf] = await file.download();
    const parsed: unknown = JSON.parse(buf.toString('utf8'));
    const stripped = stripPersonalFields(parsed, uid, emails);
    if (stripped.changed) {
      rewritten = Buffer.from(JSON.stringify(stripped.value), 'utf8');
    }
  } catch (err) {
    console.error('[account] coin metadata body left unchanged', file.name);
    if (!(err instanceof SyntaxError)) {
      // Download failed. Do not clear the uid link until we could inspect the body.
      throw err;
    }
  }

  if (rewritten) {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(custom)) {
      if (typeof value === 'string' && !personalKeys.includes(key)) {
        cleaned[key] = value;
      }
    }
    await file.save(rewritten, {
      resumable: false,
      metadata: {
        contentType: metadata.contentType || 'application/json',
        cacheControl: metadata.cacheControl || 'public, max-age=31536000, immutable',
        metadata: cleaned,
      },
    });
    return;
  }

  const patch: Record<string, string | null> = {};
  for (const key of personalKeys) patch[key] = null;
  await file.setMetadata({ metadata: patch });
}

/**
 * Keep c/{id}.json for coins the artist doc points at. Strip uid/email links
 * (Storage custom metadata `uploadedBy`, and any JSON field whose value is
 * the uid or email). Never delete the object. No coin id on the artist means
 * nothing is opened — the bucket's c/ prefix is not listed.
 */
async function stripCoinPersonalData(
  uid: string,
  emails: readonly string[],
  coinPaths: readonly string[]
): Promise<void> {
  if (coinPaths.length === 0) return;

  let bucket;
  try {
    bucket = getAdminBucket();
  } catch (err) {
    if (bucketNotConfigured(err)) return;
    throw err;
  }
  if (!bucket.name) return;

  const seen = new Set<string>();
  try {
    for (const objectPath of coinPaths) {
      if (!COIN_OBJECT_PATH.test(objectPath) || seen.has(objectPath)) continue;
      seen.add(objectPath);
      try {
        await stripCoinFile(bucket.file(objectPath), uid, emails);
      } catch (err) {
        if (isStorageNotFound(err)) continue;
        throw err;
      }
    }
  } catch (err) {
    if (bucketNotConfigured(err)) return;
    throw err;
  }
}

export async function deleteAccount(
  uid: string,
  tokenEmail: string | null
): Promise<void> {
  const db = getAdminDb();
  const userSnap = await db.collection(COLLECTIONS.users).doc(uid).get();
  const storedEmail = userSnap.exists ? userSnap.get('email') : null;
  const emails = collectEmails(
    tokenEmail,
    typeof storedEmail === 'string' ? storedEmail : null
  );

  // URLs are read before any doc delete. Storage objects are removed
  // before Firestore so a retry can still see song and artist ids.
  const docStrings: string[] = [];
  if (userSnap.exists) walkStrings(userSnap.data(), docStrings);

  const songIds = await collectIds(db, COLLECTIONS.songs, 'ownerId', uid, docStrings);
  const coinPaths = new Set<string>();
  const artistIds = await collectIds(
    db,
    COLLECTIONS.artists,
    'ownerId',
    uid,
    docStrings,
    data => {
      for (const path of coinMetadataObjectPaths(data)) coinPaths.add(path);
    }
  );
  const coinPathList = [...coinPaths];

  const generationIds = await collectWhereIn(
    db,
    COLLECTIONS.generations,
    'songId',
    songIds,
    docStrings
  );
  const songVersionIds = await collectWhereIn(
    db,
    COLLECTIONS.songVersions,
    'songId',
    songIds,
    docStrings
  );
  const artistVersionIds = await collectWhereIn(
    db,
    COLLECTIONS.artistVersions,
    'artistId',
    artistIds,
    docStrings
  );

  await deleteAccountStorage({ uid, emails, songIds, docStrings, coinPaths: coinPathList });
  const xPostIds = new Set<string>(
    await collectWhereIn(db, COLLECTIONS.xSongPosts, 'artistId', artistIds)
  );
  // xSongPosts doc id is the song id. Cover rows that have no artistId field.
  for (const songId of songIds) xPostIds.add(songId);
  const xAuthIds = new Set<string>(artistIds);
  for (const id of await collectIds(db, COLLECTIONS.artistXAuth, 'ownerId', uid)) {
    xAuthIds.add(id);
  }

  const writer = db.bulkWriter();
  writer.onWriteError(error => {
    console.error('[account] bulk delete failed', error.code, error.documentRef.path);
    return error.failedAttempts < 5;
  });

  let writerClosed = false;
  const closeWriter = async () => {
    if (writerClosed) return;
    writerClosed = true;
    await writer.close();
  };

  try {
    // X tokens and post cache before artists. Song children before songs.
    await deleteDocIds(db, writer, COLLECTIONS.generations, generationIds);
    await deleteDocIds(db, writer, COLLECTIONS.songVersions, songVersionIds);
    await deleteDocIds(db, writer, COLLECTIONS.artistXAuth, [...xAuthIds]);
    await deleteDocIds(db, writer, COLLECTIONS.xSongPosts, [...xPostIds]);
    await deleteDocIds(db, writer, COLLECTIONS.artistVersions, artistVersionIds);
    await deleteDocIds(db, writer, COLLECTIONS.songs, songIds);
    await deleteDocIds(db, writer, COLLECTIONS.artists, artistIds);

    await closeWriter();
  } catch (err) {
    await closeWriter().catch(() => undefined);
    throw err;
  }

  await stripCoinPersonalData(uid, emails, coinPathList);

  await db.recursiveDelete(db.collection(COLLECTIONS.users).doc(uid));

  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    if (isAuthUserNotFound(err)) return;
    throw err;
  }
}
