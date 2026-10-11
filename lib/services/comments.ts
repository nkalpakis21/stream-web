/**
 * Comment Service
 * 
 * Handles creating, retrieving, and managing comments on artists and songs.
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import { getFreshIdToken } from '@/lib/api/clientAuth';
import {
  COLLECTIONS,
  getCommentPath,
} from '@/lib/firebase/collections';
import { isLiveCommentData, type CommentDeleteOutcome } from '@/lib/comments/live';
import type { CommentDocument } from '@/types/firestore';

function commentFromSnapshot(id: string, data: DocumentData): CommentDocument {
  const createdAt = data.createdAt as Timestamp;
  const deleted = data.deleted === true;
  return {
    id,
    targetType: data.targetType === 'artist' ? 'artist' : 'song',
    targetId: typeof data.targetId === 'string' ? data.targetId : '',
    authorId: typeof data.authorId === 'string' ? data.authorId : '',
    content: typeof data.content === 'string' ? data.content : '',
    parentCommentId: typeof data.parentCommentId === 'string' ? data.parentCommentId : null,
    createdAt,
    updatedAt: (data.updatedAt as Timestamp) || createdAt,
    deletedAt: (data.deletedAt as Timestamp) || null,
    deleted,
  };
}

/**
 * Create a comment or reply
 */
export async function createComment(
  targetType: 'artist' | 'song',
  targetId: string,
  authorId: string,
  content: string,
  parentCommentId: string | null = null
): Promise<CommentDocument> {
  // Validate content
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    throw new Error('Comment content cannot be empty');
  }

  if (trimmedContent.length > 2000) {
    throw new Error('Comment content cannot exceed 2000 characters');
  }

  // If this is a reply, validate parent exists
  if (parentCommentId) {
    const parent = await getComment(parentCommentId);
    if (!parent) {
      throw new Error('Parent comment not found');
    }
    if (parent.targetType !== targetType || parent.targetId !== targetId) {
      throw new Error('Parent comment does not match target');
    }
  }

  const commentRef = doc(collection(db, COLLECTIONS.comments));
  const commentId = commentRef.id;

  const now = Timestamp.now();

  const comment: CommentDocument = {
    id: commentId,
    targetType,
    targetId,
    authorId,
    content: trimmedContent,
    parentCommentId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await setDoc(commentRef, comment);
  return comment;
}

/**
 * Get a comment by ID
 */
export async function getComment(commentId: string): Promise<CommentDocument | null> {
  const docRef = doc(db, getCommentPath(commentId));
  const docSnapshot = await getDoc(docRef);

  if (!docSnapshot.exists()) {
    return null;
  }

  const data = commentFromSnapshot(commentId, docSnapshot.data() as DocumentData);
  if (!isLiveCommentData(data)) {
    return null;
  }

  return data;
}

function commentFromApi(raw: DocumentData): CommentDocument {
  const createdAt = Timestamp.fromMillis(typeof raw.createdAt === 'number' ? raw.createdAt : 0);
  const updatedAt = Timestamp.fromMillis(
    typeof raw.updatedAt === 'number' ? raw.updatedAt : createdAt.toMillis()
  );
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    targetType: raw.targetType === 'artist' ? 'artist' : 'song',
    targetId: typeof raw.targetId === 'string' ? raw.targetId : '',
    authorId: typeof raw.authorId === 'string' ? raw.authorId : '',
    content: typeof raw.content === 'string' ? raw.content : '',
    parentCommentId: typeof raw.parentCommentId === 'string' ? raw.parentCommentId : null,
    createdAt,
    updatedAt,
    deletedAt: typeof raw.deletedAt === 'number' ? Timestamp.fromMillis(raw.deletedAt) : null,
    deleted: raw.deleted === true,
  };
}

/**
 * Top-level comments, including tombstones. Admin strips author, body, name, and avatar.
 */
export async function getComments(
  targetType: 'artist' | 'song',
  targetId: string,
  limitCount: number = 50,
  cursor: string | null = null
): Promise<{
  comments: CommentDocument[];
  nextCursor: string | null;
  hasMore: boolean;
  liveCount?: number;
}> {
  const params = new URLSearchParams({
    targetType,
    targetId,
    limit: String(limitCount),
  });
  if (cursor) params.set('cursor', cursor);
  const response = await fetch(`/api/comments?${params}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : 'Failed to load comments');
  }
  const comments = Array.isArray(body.comments) ? body.comments.map(commentFromApi) : [];
  return {
    comments,
    nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : null,
    hasMore: body.hasMore === true,
    ...(typeof body.liveCount === 'number' ? { liveCount: body.liveCount } : {}),
  };
}

/**
 * Replies under a comment, including tombstones. Admin strips author, body, name, and avatar.
 */
export async function getReplies(
  commentId: string,
  limitCount: number = 50,
  cursor: string | null = null
): Promise<{
  replies: CommentDocument[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const params = new URLSearchParams({
    targetType: 'song',
    targetId: commentId,
    parentCommentId: commentId,
    limit: String(limitCount),
  });
  if (cursor) params.set('cursor', cursor);
  const response = await fetch(`/api/comments?${params}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : 'Failed to load replies');
  }
  const replies = Array.isArray(body.comments) ? body.comments.map(commentFromApi) : [];
  return {
    replies,
    nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : null,
    hasMore: body.hasMore === true,
  };
}

/**
 * Update a comment
 */
export async function updateComment(
  commentId: string,
  authorId: string,
  content: string
): Promise<void> {
  const comment = await getComment(commentId);
  if (!comment) {
    throw new Error('Comment not found');
  }

  if (comment.authorId !== authorId) {
    throw new Error('You can only edit your own comments');
  }

  const trimmedContent = content.trim();
  if (!trimmedContent) {
    throw new Error('Comment content cannot be empty');
  }

  if (trimmedContent.length > 2000) {
    throw new Error('Comment content cannot exceed 2000 characters');
  }

  const commentRef = doc(db, getCommentPath(commentId));
  await updateDoc(commentRef, {
    content: trimmedContent,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete a comment through Admin. Replies keep a tombstone; otherwise the doc is removed.
 */
export async function deleteComment(
  commentId: string,
  authorId: string
): Promise<CommentDeleteOutcome> {
  const user = auth.currentUser;
  if (!user || user.uid !== authorId) {
    throw new Error('You can only delete your own comments');
  }
  const token = await getFreshIdToken(user);
  const response = await fetch('/api/comments', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ commentId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Failed to delete comment');
  }
  return data.outcome === 'tombstone' ? 'tombstone' : 'removed';
}

/**
 * Live comments on a target, replies included. Tombstones are not counted.
 */
export async function getCommentCount(
  targetType: 'artist' | 'song',
  targetId: string
): Promise<number> {
  const params = new URLSearchParams({
    targetType,
    targetId,
    count: '1',
  });
  const response = await fetch(`/api/comments?${params}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : 'Failed to count comments');
  }
  return typeof body.liveCount === 'number' ? body.liveCount : 0;
}
