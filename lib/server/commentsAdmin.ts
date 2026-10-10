import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { HttpError } from '@/lib/api/requireAuth';
import type { CommentDocument } from '@/types/firestore';

async function adminGetComment(commentId: string): Promise<CommentDocument | null> {
  const snap = await getAdminDb().collection(COLLECTIONS.comments).doc(commentId).get();
  if (!snap.exists) return null;
  const data = snap.data() as CommentDocument;
  if (data.deletedAt) return null;
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

export async function adminDeleteComment(commentId: string, authorId: string): Promise<void> {
  const comment = await adminGetComment(commentId);
  if (!comment) throw new HttpError(400, 'Comment not found');
  if (comment.authorId !== authorId) {
    throw new HttpError(403, 'You can only delete your own comments');
  }

  await getAdminDb().collection(COLLECTIONS.comments).doc(commentId).update({
    deletedAt: FieldValue.serverTimestamp(),
  });
}
