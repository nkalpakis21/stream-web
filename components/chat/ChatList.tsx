'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getUserConversations } from '@/lib/services/conversations';
import { useUsersDisplayNames } from '@/hooks/useUserDisplayName';
import type { ConversationDocument } from '@/types/firestore';
import { formatDistanceToNow } from 'date-fns';
import { MessageCircle, Users, Plus } from 'lucide-react';

interface ChatListProps {
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewChat: () => void;
}

// Serialized conversation for client
type SerializedConversationDocument = Omit<ConversationDocument, 'createdAt' | 'updatedAt' | 'lastMessageAt'> & {
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number | null;
};

export function ChatList({ selectedConversationId, onSelectConversation, onNewChat }: ChatListProps) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<SerializedConversationDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Get all participant IDs from direct conversations for batch fetching display names
  const directConversationParticipantIds = useMemo(() => {
    return conversations
      .filter(conv => conv.type === 'direct')
      .flatMap(conv => conv.participants.filter(id => id !== user?.uid));
  }, [conversations, user]);

  const { displayNames } = useUsersDisplayNames(directConversationParticipantIds);

  // Load initial conversations
  useEffect(() => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const loadConversations = async () => {
      try {
        const convos = await getUserConversations(user.uid);
        setConversations(
          convos.map(conv => ({
            ...conv,
            createdAt: conv.createdAt.toMillis(),
            updatedAt: conv.updatedAt.toMillis(),
            lastMessageAt: conv.lastMessageAt ? conv.lastMessageAt.toMillis() : null,
          }))
        );
      } catch (error) {
        console.error('Failed to load conversations:', error);
      } finally {
        setLoading(false);
      }
    };

    loadConversations();
  }, [user]);

  // Real-time updates for conversations
  useEffect(() => {
    if (!user) return;

    try {
      const q = query(
        collection(db, COLLECTIONS.conversations),
        where('participants', 'array-contains', user.uid),
        orderBy('updatedAt', 'desc')
      );

      const unsubscribe = onSnapshot(q, snapshot => {
        const updated = snapshot.docs.map(doc => {
          const data = doc.data() as ConversationDocument;
          return {
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : data.updatedAt,
            lastMessageAt: data.lastMessageAt instanceof Timestamp ? data.lastMessageAt.toMillis() : (data.lastMessageAt ? (data.lastMessageAt as any).toMillis() : null),
          };
        });
        setConversations(updated);
        setLoading(false);
      }, (error) => {
        console.error('[ChatList] Real-time listener error:', error);
        setLoading(false);
      });

      return unsubscribe;
    } catch (error: any) {
      // Fallback if index doesn't exist
      if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
        console.warn('[ChatList] Index missing, using initial load only');
        setLoading(false);
      }
    }
  }, [user]);

  if (!user) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Please sign in to view conversations
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-accent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>No conversations yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-lg font-semibold">Conversations</h2>
        <button
          onClick={onNewChat}
          className="p-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
          aria-label="New chat"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.map(conv => {
          const otherParticipants = conv.participants.filter(id => id !== user.uid);
          const displayName = conv.type === 'direct' 
            ? (otherParticipants[0] ? (displayNames.get(otherParticipants[0]) || `User ${otherParticipants[0].substring(0, 8)}...`) : 'Unknown User')
            : `Group (${conv.participants.length})`;

          return (
            <button
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              className={`w-full p-4 text-left border-b border-border hover:bg-muted/50 transition-colors ${
                selectedConversationId === conv.id ? 'bg-muted' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                  {conv.type === 'group' ? (
                    <Users className="w-5 h-5 text-accent" />
                  ) : (
                    <MessageCircle className="w-5 h-5 text-accent" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-medium text-sm truncate">{displayName}</h3>
                    {conv.lastMessageAt && (
                      <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                        {formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                  {conv.lastMessagePreview && (
                    <p className="text-sm text-muted-foreground truncate">
                      {conv.lastMessagePreview}
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
