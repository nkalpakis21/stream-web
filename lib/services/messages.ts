/**
 * Message Service
 * 
 * Handles sending, retrieving, and managing messages in conversations.
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
  arrayUnion,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import {
  COLLECTIONS,
  getMessagePath,
  getConversationPath,
} from '@/lib/firebase/collections';
import type { MessageDocument } from '@/types/firestore';
import { getConversation, updateConversationLastMessage } from './conversations';

/**
 * Send a message in a conversation
 */
export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string
): Promise<MessageDocument> {
  // Validate conversation exists and sender is a participant
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  if (!conversation.participants.includes(senderId)) {
    throw new Error('You are not a participant in this conversation');
  }

  // Validate content
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    throw new Error('Message content cannot be empty');
  }

  if (trimmedContent.length > 5000) {
    throw new Error('Message content cannot exceed 5000 characters');
  }

  const messageRef = doc(collection(db, COLLECTIONS.messages));
  const messageId = messageRef.id;

  const now = Timestamp.now();

  const message: MessageDocument = {
    id: messageId,
    conversationId,
    senderId,
    content: trimmedContent,
    createdAt: now,
    readBy: [senderId], // Sender has read their own message
    deletedAt: null,
  };

  await setDoc(messageRef, message);

  // Update conversation's last message info
  await updateConversationLastMessage(conversationId, trimmedContent);

  return message;
}

/**
 * Get paginated messages for a conversation
 */
export async function getMessages(
  conversationId: string,
  limitCount: number = 50,
  cursor: string | null = null
): Promise<{
  messages: MessageDocument[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  try {
    let q = query(
      collection(db, COLLECTIONS.messages),
      where('conversationId', '==', conversationId),
      where('deletedAt', '==', null),
      orderBy('createdAt', 'desc'),
      limit(limitCount + 1) // Fetch one extra to check if there are more
    );

    // Add cursor if provided
    if (cursor) {
      try {
        const cursorDoc = await getDoc(doc(db, getMessagePath(cursor)));
        if (cursorDoc.exists()) {
          // Note: Firestore doesn't support startAfter easily with where clauses
          // We'll filter in memory instead
        }
      } catch (error) {
        console.warn('[getMessages] Invalid cursor, starting from beginning:', error);
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
    const messages = filteredDocs
      .slice(0, limitCount)
      .map(doc => doc.data() as MessageDocument)
      .reverse(); // Reverse to show oldest first

    // Get next cursor (last message ID)
    const nextCursor = hasMore && messages.length > 0 ? messages[messages.length - 1].id : null;

    return {
      messages,
      nextCursor,
      hasMore,
    };
  } catch (error: any) {
    // Fallback if composite index doesn't exist
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      console.warn('[getMessages] Composite index missing, using fallback');
      
      const fallbackQuery = query(
        collection(db, COLLECTIONS.messages),
        where('conversationId', '==', conversationId),
        where('deletedAt', '==', null)
      );
      
      const snapshot = await getDocs(fallbackQuery);
      const allMessages = snapshot.docs
        .map(doc => doc.data() as MessageDocument)
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

      // Apply cursor
      let filteredMessages = allMessages;
      if (cursor) {
        const cursorIndex = allMessages.findIndex(msg => msg.id === cursor);
        if (cursorIndex >= 0) {
          filteredMessages = allMessages.slice(cursorIndex + 1);
        }
      }

      const hasMore = filteredMessages.length > limitCount;
      const messages = filteredMessages.slice(0, limitCount).reverse();
      const nextCursor = hasMore && messages.length > 0 ? messages[messages.length - 1].id : null;

      return {
        messages,
        nextCursor,
        hasMore,
      };
    }
    throw error;
  }
}

/**
 * Mark messages as read
 */
export async function markAsRead(
  conversationId: string,
  userId: string,
  messageIds: string[]
): Promise<void> {
  if (messageIds.length === 0) return;

  // Verify user is a participant
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  if (!conversation.participants.includes(userId)) {
    throw new Error('You are not a participant in this conversation');
  }

  // Update each message
  const updatePromises = messageIds.map(messageId => {
    const messageRef = doc(db, getMessagePath(messageId));
    return updateDoc(messageRef, {
      readBy: arrayUnion(userId),
    });
  });

  await Promise.all(updatePromises);
}

/**
 * Soft delete a message
 */
export async function deleteMessage(
  messageId: string,
  userId: string
): Promise<void> {
  const messageRef = doc(db, getMessagePath(messageId));
  const messageDoc = await getDoc(messageRef);

  if (!messageDoc.exists()) {
    throw new Error('Message not found');
  }

  const message = messageDoc.data() as MessageDocument;

  if (message.senderId !== userId) {
    throw new Error('You can only delete your own messages');
  }

  await updateDoc(messageRef, {
    deletedAt: serverTimestamp(),
  });
}
