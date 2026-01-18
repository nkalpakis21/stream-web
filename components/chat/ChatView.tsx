'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getMessages, markAsRead } from '@/lib/services/messages';
import { MessageComposer } from './MessageComposer';
import { ConversationHeader } from './ConversationHeader';
import type { MessageDocument } from '@/types/firestore';
import { formatDistanceToNow } from 'date-fns';

interface ChatViewProps {
  conversationId: string | null;
}

// Serialized message for client
type SerializedMessageDocument = Omit<MessageDocument, 'createdAt'> & {
  createdAt: number;
};

export function ChatView({ conversationId }: ChatViewProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<SerializedMessageDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Real-time updates for messages
  useEffect(() => {
    if (!conversationId || !user) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let unsubscribe: (() => void) | undefined;

    const setupListener = (useFallback: boolean = false) => {
      try {
        let q;
        
        if (useFallback) {
          // Fallback query without orderBy (no composite index needed)
          q = query(
            collection(db, COLLECTIONS.messages),
            where('conversationId', '==', conversationId),
            where('deletedAt', '==', null),
            limit(50)
          );
        } else {
          // Primary query with orderBy (requires composite index)
          q = query(
            collection(db, COLLECTIONS.messages),
            where('conversationId', '==', conversationId),
            where('deletedAt', '==', null),
            orderBy('createdAt', 'desc'),
            limit(50)
          );
        }

        unsubscribe = onSnapshot(q, snapshot => {
          let newMessages = snapshot.docs.map(doc => {
            const data = doc.data() as MessageDocument;
            return {
              ...data,
              createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
            };
          });

          // If using fallback, sort in memory
          if (useFallback) {
            newMessages.sort((a, b) => b.createdAt - a.createdAt);
          }

          // Reverse to show oldest first
          newMessages.reverse();

          setMessages(newMessages);
          setLoading(false);

          // Mark new messages as read
          const unreadMessageIds = newMessages
            .filter(msg => !msg.readBy.includes(user.uid))
            .map(msg => msg.id);
          
          if (unreadMessageIds.length > 0) {
            markAsRead(conversationId, user.uid, unreadMessageIds).catch(error => {
              console.error('Failed to mark messages as read:', error);
            });
          }
        }, (error) => {
          console.error('[ChatView] Real-time listener error:', error);
          
          // If index error and not already using fallback, retry with fallback
          if (!useFallback && (error?.code === 'failed-precondition' || error?.message?.includes('index'))) {
            console.warn('[ChatView] Composite index missing, using fallback query');
            // Clean up current listener before setting up fallback
            if (unsubscribe) {
              unsubscribe();
            }
            setupListener(true);
          } else {
            // Other errors - try initial load as last resort
            setLoading(false);
            getMessages(conversationId, 50, null)
              .then(result => {
                setMessages(
                  result.messages.map(msg => ({
                    ...msg,
                    createdAt: msg.createdAt.toMillis(),
                  }))
                );
              })
              .catch(err => {
                console.error('[ChatView] Failed to load messages:', err);
              });
          }
        });
      } catch (error: any) {
        console.error('[ChatView] Failed to set up listener:', error);
        
        // If query construction fails due to missing index, use fallback
        if (!useFallback && (error?.code === 'failed-precondition' || error?.message?.includes('index'))) {
          setupListener(true);
        } else {
          setLoading(false);
          // Last resort: use API route
          getMessages(conversationId, 50, null)
            .then(result => {
              setMessages(
                result.messages.map(msg => ({
                  ...msg,
                  createdAt: msg.createdAt.toMillis(),
                }))
              );
            })
            .catch(err => {
              console.error('[ChatView] Failed to load messages:', err);
            });
        }
      }
    };

    // Start with primary query (with orderBy)
    setupListener(false);

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [conversationId, user]);

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-lg mb-2">Select a conversation</p>
          <p className="text-sm">Choose a conversation from the list to start chatting</p>
        </div>
      </div>
    );
  }

  if (loading && messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ConversationHeader conversationId={conversationId} />
      
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.map(message => {
          const isOwn = message.senderId === user?.uid;
          const isRead = message.readBy.includes(user?.uid || '');

          return (
            <div
              key={message.id}
              className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-lg px-4 py-2 ${
                  isOwn
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                <div className="flex items-center justify-end gap-2 mt-1">
                  <span className="text-xs opacity-70">
                    {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                  </span>
                  {isOwn && (
                    <span className="text-xs opacity-70">
                      {isRead ? '✓✓' : '✓'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <MessageComposer conversationId={conversationId} />
    </div>
  );
}
