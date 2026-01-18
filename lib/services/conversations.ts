/**
 * Conversation Service
 * 
 * Handles creating and managing conversations (direct and group chats).
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
  arrayRemove,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import {
  COLLECTIONS,
  getConversationPath,
  getArtistPath,
} from '@/lib/firebase/collections';
import type { ConversationDocument } from '@/types/firestore';

/**
 * Create a new conversation
 */
export async function createConversation(
  participants: string[],
  type: 'direct' | 'group' = 'direct',
  artistId?: string
): Promise<ConversationDocument> {
  // Validate participants
  if (participants.length < 2) {
    throw new Error('Conversation must have at least 2 participants');
  }

  if (type === 'direct' && participants.length !== 2) {
    throw new Error('Direct conversation must have exactly 2 participants');
  }

  // If artistId is provided, fetch artist to get ownerId
  let ownerId: string | undefined;
  if (artistId) {
    const artistRef = doc(db, getArtistPath(artistId));
    const artistSnapshot = await getDoc(artistRef);
    if (!artistSnapshot.exists()) {
      throw new Error('Artist not found');
    }
    const artistData = artistSnapshot.data();
    ownerId = artistData.ownerId;
  }

  // For direct conversations with artistId, check if one already exists
  if (type === 'direct' && artistId) {
    const existing = await findDirectConversationByArtist(participants[0], artistId);
    if (existing) {
      return existing;
    }
  } else if (type === 'direct') {
    // Fallback to user-based lookup for backward compatibility
    const existing = await findDirectConversation(participants[0], participants[1]);
    if (existing) {
      return existing;
    }
  }

  const conversationRef = doc(collection(db, COLLECTIONS.conversations));
  const conversationId = conversationRef.id;

  const now = Timestamp.now();

  const conversation: ConversationDocument = {
    id: conversationId,
    type,
    participants: [...participants].sort(), // Sort for consistency
    artistId,
    ownerId,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    lastMessagePreview: null,
  };

  await setDoc(conversationRef, conversation);
  return conversation;
}

/**
 * Find existing direct conversation between two users
 */
async function findDirectConversation(
  userId1: string,
  userId2: string
): Promise<ConversationDocument | null> {
  try {
    // Query for conversations where both users are participants
    const q = query(
      collection(db, COLLECTIONS.conversations),
      where('type', '==', 'direct'),
      where('participants', 'array-contains', userId1)
    );

    const snapshot = await getDocs(q);
    
    // Filter in memory for conversations containing both users
    for (const docSnapshot of snapshot.docs) {
      const conv = docSnapshot.data() as ConversationDocument;
      if (conv.participants.includes(userId2) && conv.participants.length === 2) {
        return conv;
      }
    }

    return null;
  } catch (error: any) {
    // Fallback if index doesn't exist
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      console.warn('[findDirectConversation] Index missing, using fallback');
      // Fallback: get all direct conversations and filter in memory
      const q = query(
        collection(db, COLLECTIONS.conversations),
        where('type', '==', 'direct')
      );
      const snapshot = await getDocs(q);
      
      for (const docSnapshot of snapshot.docs) {
        const conv = docSnapshot.data() as ConversationDocument;
        if (conv.participants.includes(userId1) && conv.participants.includes(userId2) && conv.participants.length === 2) {
          return conv;
        }
      }
      return null;
    }
    throw error;
  }
}

/**
 * Find existing direct conversation by artist ID
 */
async function findDirectConversationByArtist(
  userId: string,
  artistId: string
): Promise<ConversationDocument | null> {
  try {
    // Query for conversations with this artistId
    const q = query(
      collection(db, COLLECTIONS.conversations),
      where('type', '==', 'direct'),
      where('artistId', '==', artistId),
      where('participants', 'array-contains', userId)
    );

    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }

    // Return the first match (should only be one)
    return snapshot.docs[0].data() as ConversationDocument;
  } catch (error: any) {
    // Fallback if index doesn't exist
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      console.warn('[findDirectConversationByArtist] Index missing, using fallback');
      // Fallback: get all direct conversations and filter in memory
      const q = query(
        collection(db, COLLECTIONS.conversations),
        where('type', '==', 'direct')
      );
      const snapshot = await getDocs(q);
      
      for (const docSnapshot of snapshot.docs) {
        const conv = docSnapshot.data() as ConversationDocument;
        if (conv.artistId === artistId && conv.participants.includes(userId) && conv.participants.length === 2) {
          return conv;
        }
      }
      return null;
    }
    throw error;
  }
}

/**
 * Get the artist associated with a conversation
 */
export async function getConversationArtist(
  conversationId: string
): Promise<{ id: string; name: string; avatarURL: string | null } | null> {
  const conversation = await getConversation(conversationId);
  if (!conversation || !conversation.artistId) {
    return null;
  }

  const artistRef = doc(db, getArtistPath(conversation.artistId));
  const artistSnapshot = await getDoc(artistRef);
  
  if (!artistSnapshot.exists()) {
    return null;
  }

  const artistData = artistSnapshot.data();
  return {
    id: conversation.artistId,
    name: artistData.name,
    avatarURL: artistData.avatarURL,
  };
}

/**
 * Get a conversation by ID
 */
export async function getConversation(
  conversationId: string
): Promise<ConversationDocument | null> {
  const docRef = doc(db, getConversationPath(conversationId));
  const docSnapshot = await getDoc(docRef);

  if (!docSnapshot.exists()) {
    return null;
  }

  return docSnapshot.data() as ConversationDocument;
}

/**
 * Get all conversations for a user
 */
export async function getUserConversations(
  userId: string,
  limitCount: number = 50
): Promise<ConversationDocument[]> {
  try {
    const q = query(
      collection(db, COLLECTIONS.conversations),
      where('participants', 'array-contains', userId),
      orderBy('updatedAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as ConversationDocument);
  } catch (error: any) {
    // Fallback if composite index doesn't exist
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      console.warn('[getUserConversations] Composite index missing, using fallback');
      
      const fallbackQuery = query(
        collection(db, COLLECTIONS.conversations),
        where('participants', 'array-contains', userId)
      );
      
      const snapshot = await getDocs(fallbackQuery);
      const conversations = snapshot.docs.map(doc => doc.data() as ConversationDocument);
      
      // Sort in memory by updatedAt descending
      return conversations.sort((a, b) => {
        const aTime = a.updatedAt?.toMillis() || a.createdAt.toMillis();
        const bTime = b.updatedAt?.toMillis() || b.createdAt.toMillis();
        return bTime - aTime;
      }).slice(0, limitCount);
    }
    throw error;
  }
}

/**
 * Add a participant to a group conversation
 */
export async function addParticipant(
  conversationId: string,
  userId: string,
  requesterId: string
): Promise<void> {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  if (conversation.type !== 'group') {
    throw new Error('Can only add participants to group conversations');
  }

  if (!conversation.participants.includes(requesterId)) {
    throw new Error('Only participants can add new members');
  }

  if (conversation.participants.includes(userId)) {
    return; // Already a participant
  }

  const conversationRef = doc(db, getConversationPath(conversationId));
  await updateDoc(conversationRef, {
    participants: arrayUnion(userId),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Remove a participant from a group conversation
 */
export async function removeParticipant(
  conversationId: string,
  userId: string,
  requesterId: string
): Promise<void> {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  if (conversation.type !== 'group') {
    throw new Error('Can only remove participants from group conversations');
  }

  // Users can remove themselves, or any participant can remove others in group chats
  if (!conversation.participants.includes(requesterId)) {
    throw new Error('Only participants can remove members');
  }

  if (!conversation.participants.includes(userId)) {
    return; // Not a participant
  }

  // Don't allow removing the last participant
  if (conversation.participants.length <= 1) {
    throw new Error('Cannot remove the last participant');
  }

  const conversationRef = doc(db, getConversationPath(conversationId));
  await updateDoc(conversationRef, {
    participants: arrayRemove(userId),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Update conversation's last message info
 */
export async function updateConversationLastMessage(
  conversationId: string,
  messagePreview: string
): Promise<void> {
  const conversationRef = doc(db, getConversationPath(conversationId));
  await updateDoc(conversationRef, {
    lastMessageAt: serverTimestamp(),
    lastMessagePreview: messagePreview.substring(0, 100), // Limit preview length
    updatedAt: serverTimestamp(),
  });
}
