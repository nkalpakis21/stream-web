/**
 * Delete a user's comments.
 * A comment with replies is overwritten (not merged) with a tombstone:
 *   { deleted, parentCommentId, targetType, targetId, createdAt }
 * A comment with no replies is hard-deleted.
 * There is no denormalized comment counter on songs, artists, or comments.
 * Live counts come from the comments query and skip tombstones.
 * An empty tombstone (replies all gone) is hard-deleted so the thread does not
 * keep a placeholder with nothing under it.
 */

import type {
  BulkWriter,
  DocumentReference,
  Firestore,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type { CommentDeleteOutcome } from '@/lib/comments/live';
import { commitBulkDeletes } from '@/lib/server/deleteAccount';

const PAGE_SIZE = 400;
const IN_LIMIT = 30;

export interface CommentTombstone {
  deleted: true;
  parentCommentId: string | null;
  targetType: 'artist' | 'song';
  targetId: string;
  createdAt: unknown;
}

type CommentData = Record<string, unknown>;

interface LoadedComment {
  id: string;
  ref: DocumentReference;
  data: CommentData;
}

export function commentTombstone(data: CommentData): CommentTombstone {
  const parent = data.parentCommentId;
  const targetType = data.targetType === 'artist' ? 'artist' : 'song';
  const targetId = typeof data.targetId === 'string' ? data.targetId : '';
  return {
    deleted: true,
    parentCommentId: typeof parent === 'string' ? parent : null,
    targetType,
    targetId,
    createdAt: data.createdAt ?? null,
  };
}

async function commitBulkSets(
  writer: BulkWriter,
  writes: readonly { ref: DocumentReference; data: CommentTombstone }[]
): Promise<void> {
  const ops = writes.map(write => writer.set(write.ref, write.data));
  await writer.flush();
  await Promise.all(ops);
}

async function loadWhere(
  db: Firestore,
  field: string,
  value: string
): Promise<LoadedComment[]> {
  const loaded: LoadedComment[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = db.collection(COLLECTIONS.comments).where(field, '==', value).limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (snap.empty) return loaded;
    for (const doc of snap.docs) {
      loaded.push({ id: doc.id, ref: doc.ref, data: doc.data() as CommentData });
    }
    if (snap.size < PAGE_SIZE) return loaded;
    const last = snap.docs[snap.docs.length - 1];
    if (cursor && last.id === cursor.id) {
      throw Object.assign(new Error('delete-failed'), { code: 'delete-failed' });
    }
    cursor = last;
  }
}

async function parentIdsWithReplies(db: Firestore, commentIds: readonly string[]): Promise<Set<string>> {
  const parents = new Set<string>();
  for (let i = 0; i < commentIds.length; i += IN_LIMIT) {
    const chunk = commentIds.slice(i, i + IN_LIMIT);
    if (chunk.length === 0) continue;
    const snap = await db.collection(COLLECTIONS.comments).where('parentCommentId', 'in', chunk).get();
    for (const doc of snap.docs) {
      const parent = doc.get('parentCommentId');
      if (typeof parent === 'string' && chunk.includes(parent)) parents.add(parent);
    }
  }
  return parents;
}

async function hasReplies(db: Firestore, commentId: string): Promise<boolean> {
  const snap = await db
    .collection(COLLECTIONS.comments)
    .where('parentCommentId', '==', commentId)
    .limit(1)
    .get();
  return !snap.empty;
}

/**
 * Hard-delete tombstones that no longer have replies, then walk up.
 * Live parent comments are left alone.
 */
export async function collapseEmptyTombstones(
  db: Firestore,
  writer: BulkWriter,
  seeds: readonly string[]
): Promise<void> {
  let frontier = [...new Set(seeds.filter(id => typeof id === 'string' && id))];
  const visited = new Set<string>();
  while (frontier.length > 0) {
    const toDelete: DocumentReference[] = [];
    const next: string[] = [];
    for (const id of frontier) {
      if (visited.has(id)) continue;
      visited.add(id);
      const ref = db.collection(COLLECTIONS.comments).doc(id);
      const snap = await ref.get();
      if (!snap.exists) continue;
      const data = (snap.data() ?? {}) as CommentData;
      if (data.deleted !== true) continue;
      if (await hasReplies(db, id)) continue;
      toDelete.push(ref);
      if (typeof data.parentCommentId === 'string' && data.parentCommentId) {
        next.push(data.parentCommentId);
      }
    }
    for (let i = 0; i < toDelete.length; i += PAGE_SIZE) {
      await commitBulkDeletes(writer, toDelete.slice(i, i + PAGE_SIZE));
    }
    frontier = next;
  }
}

/**
 * Remove every comment this user authored.
 * Idempotent: tombstones have no authorId, so a retry matches nothing.
 */
export async function deleteAuthoredComments(
  db: Firestore,
  writer: BulkWriter,
  uid: string
): Promise<void> {
  const authored = await loadWhere(db, 'authorId', uid);
  if (authored.length === 0) return;

  const withReplies = await parentIdsWithReplies(
    db,
    authored.map(comment => comment.id)
  );

  const tombstones = authored.filter(comment => withReplies.has(comment.id));
  const removed = authored.filter(comment => !withReplies.has(comment.id));

  for (let i = 0; i < tombstones.length; i += PAGE_SIZE) {
    const page = tombstones.slice(i, i + PAGE_SIZE);
    await commitBulkSets(
      writer,
      page.map(comment => ({ ref: comment.ref, data: commentTombstone(comment.data) }))
    );
  }

  for (let i = 0; i < removed.length; i += PAGE_SIZE) {
    await commitBulkDeletes(
      writer,
      removed.slice(i, i + PAGE_SIZE).map(comment => comment.ref)
    );
  }

  const seeds = [
    ...tombstones.map(comment => comment.id),
    ...removed.map(comment =>
      typeof comment.data.parentCommentId === 'string' ? comment.data.parentCommentId : ''
    ),
  ];
  await collapseEmptyTombstones(db, writer, seeds);
}

/**
 * Author delete of one comment. Missing and already-tombstoned docs are success
 * for a retry (`removed`). A different author is rejected by the caller.
 */
export async function deleteOneComment(
  db: Firestore,
  writer: BulkWriter,
  commentId: string,
  authorId: string
): Promise<{ outcome: CommentDeleteOutcome; authorMatches: boolean; found: boolean }> {
  const ref = db.collection(COLLECTIONS.comments).doc(commentId);
  const snap = await ref.get();
  if (!snap.exists) return { outcome: 'removed', authorMatches: true, found: false };
  const data = (snap.data() ?? {}) as CommentData;
  if (data.deleted === true) return { outcome: 'removed', authorMatches: true, found: false };
  if (data.authorId !== authorId) {
    return { outcome: 'removed', authorMatches: false, found: true };
  }

  const replies = await hasReplies(db, commentId);
  if (replies) {
    await commitBulkSets(writer, [{ ref, data: commentTombstone(data) }]);
    return { outcome: 'tombstone', authorMatches: true, found: true };
  }

  await commitBulkDeletes(writer, [ref]);
  if (typeof data.parentCommentId === 'string') {
    await collapseEmptyTombstones(db, writer, [data.parentCommentId]);
  }
  return { outcome: 'removed', authorMatches: true, found: true };
}
