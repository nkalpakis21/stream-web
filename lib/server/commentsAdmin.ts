import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { HttpError } from '@/lib/api/requireAuth';
import { countLiveComments, type CommentDeleteOutcome } from '@/lib/comments/live';
import { deleteOneComment } from '@/lib/server/commentDelete';
import type { CommentDocument } from '@/types/firestore';

async function adminGetComment(commentId: string): Promise<CommentDocument | null> {
  const snap = await getAdminDb().collection(COLLECTIONS.comments).doc(commentId).get();
  if (!snap.exists) return null;
  const data = snap.data() as CommentDocument;
  if (data.deletedAt || data.deleted === true) return null;
  return data;
}

export async function adminCreateComment(
  targetType: 'artist' | 'song',
  targetId: string,
  authorId: string,
  content: string,
  parentCommentId: string | null = null
): Promise<CommentDocument> {
  const trimmedContent = content.trim();
  if (!trimmedContent) throw new HttpError(400, 'Comment content cannot be empty');
  if (trimmedContent.length > 2000) {
    throw new HttpError(400, 'Comment content cannot exceed 2000 characters');
  }

  if (parentCommentId) {
    const parent = await adminGetComment(parentCommentId);
    if (!parent) throw new HttpError(400, 'Parent comment not found');
    if (parent.targetType !== targetType || parent.targetId !== targetId) {
      throw new HttpError(400, 'Parent comment does not match target');
    }
  }

  const commentRef = getAdminDb().collection(COLLECTIONS.comments).doc();
  const now = Timestamp.now();
  const comment = {
    id: commentRef.id,
    targetType,
    targetId,
    authorId,
    content: trimmedContent,
    parentCommentId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await commentRef.set(comment);
  return comment as unknown as CommentDocument;
}

export async function adminUpdateComment(
  commentId: string,
  authorId: string,
  content: string
): Promise<void> {
  const comment = await adminGetComment(commentId);
  if (!comment) throw new HttpError(400, 'Comment not found');
  if (comment.authorId !== authorId) {
    throw new HttpError(403, 'You can only edit your own comments');
  }

  const trimmedContent = content.trim();
  if (!trimmedContent) throw new HttpError(400, 'Comment content cannot be empty');
  if (trimmedContent.length > 2000) {
    throw new HttpError(400, 'Comment content cannot exceed 2000 characters');
  }

  await getAdminDb().collection(COLLECTIONS.comments).doc(commentId).update({
    content: trimmedContent,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function adminDeleteComment(
  commentId: string,
  authorId: string
): Promise<CommentDeleteOutcome> {
  const db = getAdminDb();
  const writer = db.bulkWriter();
  writer.onWriteError(error => error.failedAttempts < 5);
  try {
    const result = await deleteOneComment(db, writer, commentId, authorId);
    if (!result.found) throw new HttpError(400, 'Comment not found');
    if (!result.authorMatches) {
      throw new HttpError(403, 'You can only delete your own comments');
    }
    return result.outcome;
  } finally {
    await writer.close();
  }
}

/**
 * A tombstone is returned as the five stored fields only.
 * Author, body, name, and avatar are never copied, even if a doc was poisoned.
 */
function presentComment(id: string, data: FirebaseFirestore.DocumentData): CommentDocument | null {
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.fromMillis(0);
  if (data.deleted === true) {
    return {
      id,
      targetType: data.targetType === 'artist' ? 'artist' : 'song',
      targetId: typeof data.targetId === 'string' ? data.targetId : '',
      authorId: '',
      content: '',
      parentCommentId: typeof data.parentCommentId === 'string' ? data.parentCommentId : null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      deleted: true,
    } as unknown as CommentDocument;
  }
  if (data.deletedAt) return null;
  return {
    id,
    targetType: data.targetType === 'artist' ? 'artist' : 'song',
    targetId: typeof data.targetId === 'string' ? data.targetId : '',
    authorId: typeof data.authorId === 'string' ? data.authorId : '',
    content: typeof data.content === 'string' ? data.content : '',
    parentCommentId: typeof data.parentCommentId === 'string' ? data.parentCommentId : null,
    createdAt,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : createdAt,
    deletedAt: null,
    deleted: false,
  } as unknown as CommentDocument;
}

type CommentRow = { id: string; data: FirebaseFirestore.DocumentData };

function byCreatedAt(newestFirst: boolean) {
  return (a: CommentDocument, b: CommentDocument) => {
    const delta = a.createdAt.toMillis() - b.createdAt.toMillis();
    return newestFirst ? -delta : delta;
  };
}

function pageOf(
  comments: CommentDocument[],
  limitCount: number,
  cursor: string | null
): { comments: CommentDocument[]; nextCursor: string | null; hasMore: boolean } {
  let rows = comments;
  if (cursor) {
    const index = rows.findIndex(item => item.id === cursor);
    if (index >= 0) rows = rows.slice(index + 1);
  }
  const hasMore = rows.length > limitCount;
  const page = rows.slice(0, limitCount);
  return {
    comments: page,
    nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
    hasMore,
  };
}

/**
 * One equality on `targetId` (automatic single-field index). The page and the
 * live count both come from that snapshot, so a missing composite index cannot
 * add a second failed query.
 */
async function loadTargetComments(
  targetType: 'artist' | 'song',
  targetId: string
): Promise<CommentRow[]> {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.comments)
    .where('targetId', '==', targetId)
    .get();
  return snap.docs
    .map(item => ({ id: item.id, data: item.data() }))
    .filter(row => row.data.targetType === targetType);
}

/** Live comments on a target, replies included. Tombstones are not counted. */
export async function adminCountLiveComments(
  targetType: 'artist' | 'song',
  targetId: string
): Promise<number> {
  const rows = await loadTargetComments(targetType, targetId);
  return countLiveComments(rows.map(row => row.data));
}

export async function adminListComments(
  targetType: 'artist' | 'song',
  targetId: string,
  limitCount = 50,
  cursor: string | null = null
) {
  const rows = await loadTargetComments(targetType, targetId);
  const liveCount = countLiveComments(rows.map(row => row.data));
  const topLevel = rows
    .filter(row => row.data.parentCommentId == null)
    .map(row => presentComment(row.id, row.data))
    .filter((item): item is CommentDocument => item != null)
    .sort(byCreatedAt(true));
  return { ...pageOf(topLevel, limitCount, cursor), liveCount };
}

export async function adminListReplies(commentId: string, limitCount = 50, cursor: string | null = null) {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.comments)
    .where('parentCommentId', '==', commentId)
    .get();
  const replies = snap.docs
    .map(item => presentComment(item.id, item.data()))
    .filter((item): item is CommentDocument => item != null)
    .sort(byCreatedAt(false));
  return pageOf(replies, limitCount, cursor);
}
