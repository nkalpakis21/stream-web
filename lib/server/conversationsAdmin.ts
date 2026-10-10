import { FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { HttpError } from '@/lib/api/requireAuth';
import type { ConversationDocument, MessageDocument } from '@/types/firestore';
import { isMissingIndexError } from '@/lib/server/indexError';

function asConversation(data: DocumentData): ConversationDocument {
  return data as ConversationDocument;
}

export async function adminGetConversation(
  conversationId: string
): Promise<ConversationDocument | null> {
  const snap = await getAdminDb().collection(COLLECTIONS.conversations).doc(conversationId).get();
  if (!snap.exists) return null;
  return asConversation(snap.data()!);
}

async function findDirectConversation(
  userId1: string,
  userId2: string
): Promise<ConversationDocument | null> {
  const collection = getAdminDb().collection(COLLECTIONS.conversations);
  const match = (conv: ConversationDocument) =>
    conv.participants.includes(userId2) && conv.participants.length === 2;

  try {
    const snap = await collection
      .where('type', '==', 'direct')
      .where('participants', 'array-contains', userId1)
      .get();
    for (const doc of snap.docs) {
      const conv = asConversation(doc.data());
      if (match(conv)) return conv;
    }
    return null;
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    console.warn('[findDirectConversation] Index missing, using fallback');
    const snap = await collection.where('type', '==', 'direct').get();
    for (const doc of snap.docs) {
      const conv = asConversation(doc.data());
      if (conv.participants.includes(userId1) && match(conv)) return conv;
    }
    return null;
  }
}

async function findDirectConversationByArtist(
  userId: string,
  artistId: string
): Promise<ConversationDocument | null> {
  const collection = getAdminDb().collection(COLLECTIONS.conversations);
  try {
    const snap = await collection
      .where('type', '==', 'direct')
      .where('artistId', '==', artistId)
      .where('participants', 'array-contains', userId)
      .get();
    if (snap.empty) return null;
    return asConversation(snap.docs[0].data());
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    console.warn('[findDirectConversationByArtist] Index missing, using fallback');
    const snap = await collection.where('type', '==', 'direct').get();
    for (const doc of snap.docs) {
      const conv = asConversation(doc.data());
      if (
        conv.artistId === artistId &&
        conv.participants.includes(userId) &&
        conv.participants.length === 2
      ) {
        return conv;
      }
    }
    return null;
  }
}

export async function adminCreateConversation(
  participants: string[],
  type: 'direct' | 'group',
  artistId: string | undefined,
  createdBy: string,
  artistIds?: string[]
): Promise<ConversationDocument> {
  if (!participants.includes(createdBy)) {
    throw new HttpError(403, 'You must be a participant in the conversation');
  }
  if (participants.length < 2) {
    throw new HttpError(400, 'Conversation must have at least 2 participants');
  }
  if (type === 'direct' && participants.length !== 2) {
    throw new HttpError(400, 'Direct conversation must have exactly 2 participants');
  }

  if (type === 'direct' && artistId) {
    const existing = await findDirectConversationByArtist(createdBy, artistId);
    if (existing) {
      if (!existing.participants.includes(createdBy)) {
        throw new HttpError(403, 'You are not a participant in the conversation');
      }
      return existing;
    }
  } else if (type === 'direct') {
    const other = participants.find((id) => id !== createdBy);
    if (!other) {
      throw new HttpError(400, 'Direct conversation must have exactly 2 participants');
    }
    const existing = await findDirectConversation(createdBy, other);
    if (existing) return existing;
  }

  const conversationRef = getAdminDb().collection(COLLECTIONS.conversations).doc();
  const now = Timestamp.now();
  const conversation: Record<string, unknown> = {
    id: conversationRef.id,
    type,
    participants: [...participants].sort(),
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    lastMessagePreview: null,
    createdBy,
  };
  if (artistId !== undefined) conversation.artistId = artistId;
  if (artistIds !== undefined && artistIds.length > 0) conversation.artistIds = artistIds;

  await conversationRef.set(conversation);
  return conversation as unknown as ConversationDocument;
}

export async function adminGetUserConversations(
  userId: string,
  limitCount: number = 50
): Promise<ConversationDocument[]> {
  const collection = getAdminDb().collection(COLLECTIONS.conversations);
  try {
    const snap = await collection
      .where('participants', 'array-contains', userId)
      .orderBy('updatedAt', 'desc')
      .limit(limitCount)
      .get();
    return snap.docs.map((doc) => asConversation(doc.data()));
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    console.warn('[adminGetUserConversations] Composite index missing, using fallback');
    const snap = await collection.where('participants', 'array-contains', userId).get();
    return snap.docs
      .map((doc) => asConversation(doc.data()))
      .sort((a, b) => {
        const aTime = a.updatedAt?.toMillis() || a.createdAt.toMillis();
        const bTime = b.updatedAt?.toMillis() || b.createdAt.toMillis();
        return bTime - aTime;
      })
      .slice(0, limitCount);
  }
}

function assertParticipant(conversation: ConversationDocument, userId: string): void {
  if (!conversation.participants.includes(userId)) {
    throw new HttpError(403, 'You are not a participant in this conversation');
  }
}

export async function adminAddParticipant(
  conversationId: string,
  userId: string,
  requesterId: string
): Promise<void> {
  const conversation = await adminGetConversation(conversationId);
  if (!conversation) throw new HttpError(400, 'Conversation not found');
  if (conversation.type !== 'group') {
    throw new HttpError(400, 'Can only add participants to group conversations');
  }
  assertParticipant(conversation, requesterId);
  if (conversation.participants.includes(userId)) return;

  await getAdminDb().collection(COLLECTIONS.conversations).doc(conversationId).update({
    participants: FieldValue.arrayUnion(userId),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function adminRemoveParticipant(
  conversationId: string,
  userId: string,
  requesterId: string
): Promise<void> {
  const conversation = await adminGetConversation(conversationId);
  if (!conversation) throw new HttpError(400, 'Conversation not found');
  if (conversation.type !== 'group') {
    throw new HttpError(400, 'Can only remove participants from group conversations');
  }
  assertParticipant(conversation, requesterId);
  if (!conversation.participants.includes(userId)) return;
  if (conversation.participants.length <= 1) {
    throw new HttpError(400, 'Cannot remove the last participant');
  }

  await getAdminDb().collection(COLLECTIONS.conversations).doc(conversationId).update({
    participants: FieldValue.arrayRemove(userId),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function adminUpdateConversationTitle(
  conversationId: string,
  title: string,
  requesterId: string
): Promise<void> {
  const conversation = await adminGetConversation(conversationId);
  if (!conversation) throw new HttpError(400, 'Conversation not found');
  if (conversation.createdBy !== requesterId) {
    throw new HttpError(403, 'Only the creator can update the conversation title');
  }

  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) throw new HttpError(400, 'Title cannot be empty');
  if (trimmedTitle.length > 100) {
    throw new HttpError(400, 'Title must be 100 characters or less');
  }
  if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmedTitle)) {
    throw new HttpError(
      400,
      'Title can only contain letters, numbers, spaces, hyphens, and underscores'
    );
  }

  await getAdminDb().collection(COLLECTIONS.conversations).doc(conversationId).update({
    title: trimmedTitle,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function adminSendMessage(
  conversationId: string,
  senderId: string,
  content: string
): Promise<MessageDocument> {
  const conversation = await adminGetConversation(conversationId);
  if (!conversation) throw new HttpError(400, 'Conversation not found');
  assertParticipant(conversation, senderId);

  const trimmedContent = content.trim();
  if (!trimmedContent) throw new HttpError(400, 'Message content cannot be empty');
  if (trimmedContent.length > 5000) {
    throw new HttpError(400, 'Message content cannot exceed 5000 characters');
  }

  const db = getAdminDb();
  const messageRef = db.collection(COLLECTIONS.messages).doc();
  const now = Timestamp.now();
  const message = {
    id: messageRef.id,
    conversationId,
    senderId,
    content: trimmedContent,
    createdAt: now,
    readBy: [senderId],
    deletedAt: null,
  };
  await messageRef.set(message);
  await db.collection(COLLECTIONS.conversations).doc(conversationId).update({
    lastMessageAt: FieldValue.serverTimestamp(),
    lastMessagePreview: trimmedContent.substring(0, 100),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return message as unknown as MessageDocument;
}

export async function adminGetMessages(
  conversationId: string,
  requesterId: string,
  limitCount: number = 50,
  cursor: string | null = null
): Promise<{ messages: MessageDocument[]; nextCursor: string | null; hasMore: boolean }> {
  const conversation = await adminGetConversation(conversationId);
  if (!conversation) throw new HttpError(404, 'Conversation not found');
  assertParticipant(conversation, requesterId);

  const collection = getAdminDb().collection(COLLECTIONS.messages);
  try {
    const snap = await collection
      .where('conversationId', '==', conversationId)
      .where('deletedAt', '==', null)
      .orderBy('createdAt', 'desc')
      .limit(limitCount + 1)
      .get();
    let docs = snap.docs;
    if (cursor) {
      const cursorIndex = docs.findIndex((doc) => doc.id === cursor);
      if (cursorIndex >= 0) docs = docs.slice(cursorIndex + 1);
    }
    const hasMore = docs.length > limitCount;
    const messages = docs
      .slice(0, limitCount)
      .map((doc) => doc.data() as MessageDocument)
      .reverse();
    const nextCursor = hasMore && messages.length > 0 ? messages[messages.length - 1].id : null;
    return { messages, nextCursor, hasMore };
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    console.warn('[adminGetMessages] Composite index missing, using fallback');
    const snap = await collection
      .where('conversationId', '==', conversationId)
      .where('deletedAt', '==', null)
      .get();
    let allMessages = snap.docs
      .map((doc) => doc.data() as MessageDocument)
      .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    if (cursor) {
      const cursorIndex = allMessages.findIndex((msg) => msg.id === cursor);
      if (cursorIndex >= 0) allMessages = allMessages.slice(cursorIndex + 1);
    }
    const hasMore = allMessages.length > limitCount;
    const messages = allMessages.slice(0, limitCount).reverse();
    const nextCursor = hasMore && messages.length > 0 ? messages[messages.length - 1].id : null;
    return { messages, nextCursor, hasMore };
  }
}
