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

async function collectIds(
  db: Firestore,
  collectionName: string,
  field: string,
  value: string
): Promise<string[]> {
  const ids: string[] = [];
  await mapPage(
    cursor => {
      let query = db.collection(collectionName).where(field, '==', value).limit(PAGE_SIZE);
      if (cursor) query = query.startAfter(cursor);
      return query;
    },
    async docs => {
      for (const doc of docs) ids.push(doc.id);
    }
  );
  return ids;
}

async function collectWhereIn(
  db: Firestore,
  collectionName: string,
  field: string,
  values: readonly string[]
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
        for (const doc of docs) ids.push(doc.id);
      }
    );
  }
  return ids;
}

async function deleteDocIds(
  db: Firestore,
  writer: BulkWriter,
  collectionName: string,
  ids: readonly string[]
): Promise<void> {
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += PAGE_SIZE) {
    const chunk = unique.slice(i, i + PAGE_SIZE);
    await Promise.all(
      chunk.map(id => writer.delete(db.collection(collectionName).doc(id)))
    );
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
 * Keep c/{id}.json. Strip uid/email links (Storage custom metadata `uploadedBy`,
 * and any JSON field whose value is the uid or email). Never delete the object.
 */
async function stripCoinPersonalData(
  uid: string,
  emails: readonly string[]
): Promise<void> {
  let bucket;
  try {
    bucket = getAdminBucket();
  } catch (err) {
    if (bucketNotConfigured(err)) return;
    throw err;
  }
  if (!bucket.name) return;

  let pageToken: string | undefined;
  try {
    do {
      const [files, next] = await bucket.getFiles({
        prefix: 'c/',
        autoPaginate: false,
        maxResults: 100,
        pageToken,
      });
      if (files.length === 0) break;
      for (const file of files) {
        await stripCoinFile(file, uid, emails);
      }
      const nextToken = next?.pageToken;
      if (!nextToken || nextToken === pageToken) break;
      pageToken = nextToken;
    } while (pageToken);
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

  const songIds = await collectIds(db, COLLECTIONS.songs, 'ownerId', uid);
  const artistIds = await collectIds(db, COLLECTIONS.artists, 'ownerId', uid);

  // Read every child id before deleting parents so a retry can finish
  // whatever a crashed run already removed.
  const generationIds = await collectWhereIn(
    db,
    COLLECTIONS.generations,
    'songId',
    songIds
  );
  const songVersionIds = await collectWhereIn(
    db,
    COLLECTIONS.songVersions,
    'songId',
    songIds
  );
  const artistVersionIds = await collectWhereIn(
    db,
    COLLECTIONS.artistVersions,
    'artistId',
    artistIds
  );
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

  await stripCoinPersonalData(uid, emails);

  await db.recursiveDelete(db.collection(COLLECTIONS.users).doc(uid));

  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    if (isAuthUserNotFound(err)) return;
    throw err;
  }
}
