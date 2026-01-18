/**
 * Comment Service
 * 
 * Handles creating, retrieving, and managing comments on artists and songs.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import {
  COLLECTIONS,
  getCommentPath,
} from '@/lib/firebase/collections';
import type { CommentDocument } from '@/types/firestore';

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

  const data = docSnapshot.data() as CommentDocument;
  if (data.deletedAt) {
    return null; // Treat soft-deleted comments as not found
  }

  return data;
}

/**
 * Get paginated top-level comments for a target
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
}> {
  try {
    let q = query(
      collection(db, COLLECTIONS.comments),
      where('targetType', '==', targetType),
      where('targetId', '==', targetId),
      where('parentCommentId', '==', null),
      where('deletedAt', '==', null),
      orderBy('createdAt', 'desc'),
      limit(limitCount + 1) // Fetch one extra to check if there are more
    );

    // Add cursor if provided
    if (cursor) {
      try {
        const cursorDoc = await getDoc(doc(db, getCommentPath(cursor)));
        if (!cursorDoc.exists()) {
          // Invalid cursor, start from beginning
        }
      } catch (error) {
        console.warn('[getComments] Invalid cursor, starting from beginning:', error);
      }
    }

    const snapshot = await getDocs(q);
    const docs = snapshot.docs;

    // Filter by cursor in memory if needed
    let filteredDocs = docs;
    if (cursor) {
      const cursorIndex = docs.findIndex(d => d.id === cursor);
      if (cursorIndex >= 0) {
        filteredDocs = docs.slice(cursorIndex + 1);
      }
    }

    // Check if there are more results
    const hasMore = filteredDocs.length > limitCount;
    const comments = filteredDocs
      .slice(0, limitCount)
      .map(doc => doc.data() as CommentDocument);

    // Get next cursor (last comment ID)
    const nextCursor = hasMore && comments.length > 0 ? comments[comments.length - 1].id : null;

    return {
      comments,
      nextCursor,
      hasMore,
    };
  } catch (error: any) {
    // Fallback if composite index doesn't exist
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      console.warn('[getComments] Composite index missing, using fallback');
      
      const fallbackQuery = query(
        collection(db, COLLECTIONS.comments),
        where('targetType', '==', targetType),
        where('targetId', '==', targetId),
        where('parentCommentId', '==', null),
        where('deletedAt', '==', null)
      );
      
      const snapshot = await getDocs(fallbackQuery);
      const allComments = snapshot.docs
        .map(doc => doc.data() as CommentDocument)
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

      // Apply cursor
      let filteredComments = allComments;
      if (cursor) {
        const cursorIndex = allComments.findIndex(comment => comment.id === cursor);
        if (cursorIndex >= 0) {
          filteredComments = allComments.slice(cursorIndex + 1);
        }
      }

      const hasMore = filteredComments.length > limitCount;
      const comments = filteredComments.slice(0, limitCount);
      const nextCursor = hasMore && comments.length > 0 ? comments[comments.length - 1].id : null;

      return {
        comments,
        nextCursor,
        hasMore,
      };
    }
    throw error;
  }
}

/**
 * Get replies to a comment
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
  try {
    let q = query(
      collection(db, COLLECTIONS.comments),
      where('parentCommentId', '==', commentId),
      where('deletedAt', '==', null),
      orderBy('createdAt', 'asc'), // Replies shown chronologically
      limit(limitCount + 1)
    );

    const snapshot = await getDocs(q);
    const docs = snapshot.docs;

    // Filter by cursor in memory if needed
    let filteredDocs = docs;
    if (cursor) {
      const cursorIndex = docs.findIndex(d => d.id === cursor);
      if (cursorIndex >= 0) {
        filteredDocs = docs.slice(cursorIndex + 1);
      }
    }

    const hasMore = filteredDocs.length > limitCount;
    const replies = filteredDocs
      .slice(0, limitCount)
      .map(doc => doc.data() as CommentDocument);

    const nextCursor = hasMore && replies.length > 0 ? replies[replies.length - 1].id : null;

    return {
      replies,
      nextCursor,
      hasMore,
    };
  } catch (error: any) {
    // Fallback if composite index doesn't exist
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      console.warn('[getReplies] Composite index missing, using fallback');
      
      const fallbackQuery = query(
        collection(db, COLLECTIONS.comments),
        where('parentCommentId', '==', commentId),
        where('deletedAt', '==', null)
      );
      
      const snapshot = await getDocs(fallbackQuery);
      const allReplies = snapshot.docs
        .map(doc => doc.data() as CommentDocument)
        .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());

      // Apply cursor
      let filteredReplies = allReplies;
      if (cursor) {
        const cursorIndex = allReplies.findIndex(reply => reply.id === cursor);
        if (cursorIndex >= 0) {
          filteredReplies = allReplies.slice(cursorIndex + 1);
        }
      }

      const hasMore = filteredReplies.length > limitCount;
      const replies = filteredReplies.slice(0, limitCount);
      const nextCursor = hasMore && replies.length > 0 ? replies[replies.length - 1].id : null;

      return {
        replies,
        nextCursor,
        hasMore,
      };
    }
    throw error;
  }
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
 * Soft delete a comment
 */
export async function deleteComment(
  commentId: string,
  authorId: string
): Promise<void> {
  const comment = await getComment(commentId);
  if (!comment) {
    throw new Error('Comment not found');
  }

  if (comment.authorId !== authorId) {
    throw new Error('You can only delete your own comments');
  }

  const commentRef = doc(db, getCommentPath(commentId));
  await updateDoc(commentRef, {
    deletedAt: serverTimestamp(),
  });
}

/**
 * Get total comment count for a target (including replies)
 */
export async function getCommentCount(
  targetType: 'artist' | 'song',
  targetId: string
): Promise<number> {
  const q = query(
    collection(db, COLLECTIONS.comments),
    where('targetType', '==', targetType),
    where('targetId', '==', targetId),
    where('deletedAt', '==', null)
  );

  const snapshot = await getDocs(q);
  return snapshot.size;
}
