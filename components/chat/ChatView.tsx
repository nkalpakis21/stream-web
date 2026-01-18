'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getMessages, markAsRead } from '@/lib/services/messages';
import { getConversation } from '@/lib/services/conversations';
import { MessageComposer } from './MessageComposer';
import { ConversationHeader } from './ConversationHeader';
import type { MessageDocument, ConversationDocument, UserDocument } from '@/types/firestore';
import { formatDistanceToNow } from 'date-fns';
import { useUsersData, useArtistsData } from '@/hooks/useUserDisplayName';
import { getAvatarGradient, getInitials } from '@/lib/utils/avatar';
import type { AIArtistDocument } from '@/types/firestore';
import Image from 'next/image';

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
  const [conversation, setConversation] = useState<ConversationDocument | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Extract unique sender IDs from messages
  const uniqueSenderIds = useMemo(() => {
    const senderIds = messages.map(msg => msg.senderId);
    return Array.from(new Set(senderIds));
  }, [messages]);

  // Extract artist IDs from conversation
  const artistIds = useMemo(() => {
    if (!conversation) return [];
    if (conversation.artistIds && conversation.artistIds.length > 0) {
      return conversation.artistIds;
    }
    if (conversation.artistId) {
      return [conversation.artistId];
    }
    return [];
  }, [conversation]);

  // Fetch artist data for all artists in conversation
  const { artistsData } = useArtistsData(artistIds);

  // Create mapping from ownerId -> artist for quick lookup
  const ownerToArtistMap = useMemo(() => {
    const map = new Map<string, AIArtistDocument>();
    artistsData.forEach(artist => {
      if (artist.ownerId && !artist.deletedAt) {
        map.set(artist.ownerId, artist);
      }
    });
    return map;
  }, [artistsData]);

  // Fetch user data as fallback (for non-artist conversations or error states)
  const { usersData } = useUsersData(uniqueSenderIds);

  // Fetch conversation to determine if it's a group chat
  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      return;
    }

    getConversation(conversationId)
      .then(conv => {
        setConversation(conv);
      })
      .catch(error => {
        console.error('Failed to load conversation:', error);
      });
  }, [conversationId]);

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
      <div className="flex-1 flex items-center justify-center text-muted-foreground p-8">
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
          const isGroupChat = conversation?.type === 'group';
          
          // Get sender's artist (if conversation has artists)
          const senderArtist = ownerToArtistMap.get(message.senderId);
          const hasArtists = artistIds.length > 0;
          
          // Get sender display name - prefer artist name, fallback to user name
          let senderName: string;
          if (isOwn) {
            senderName = 'You';
          } else if (hasArtists && senderArtist) {
            // Show artist name if available
            senderName = senderArtist.name;
          } else if (hasArtists && !senderArtist) {
            // Error state: sender doesn't own any artist in conversation (shouldn't happen)
            senderName = `Error: User ${message.senderId.substring(0, 8)}...`;
          } else {
            // Fallback to user display name for non-artist conversations
            const senderUser = usersData.get(message.senderId);
            if (senderUser) {
              senderName = senderUser.displayName || senderUser.email?.split('@')[0] || `User ${message.senderId.substring(0, 8)}...`;
            } else {
              senderName = `User ${message.senderId.substring(0, 8)}...`;
            }
          }

          // Get sender avatar - prefer artist avatar, fallback to user avatar
          const getSenderAvatar = () => {
            if (isOwn) {
              // For own messages, optionally show avatar or just name
              return null;
            }
            
            // Use artist avatar if available
            if (hasArtists && senderArtist) {
              if (senderArtist.avatarURL) {
                return (
                  <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                    <Image
                      src={senderArtist.avatarURL}
                      alt={senderArtist.name}
                      width={24}
                      height={24}
                      className="object-cover"
                    />
                  </div>
                );
              }
              
              // Fallback to gradient avatar with artist initials
              const avatarBg = getAvatarGradient(senderArtist.name);
              const initials = getInitials(senderArtist.name);
              return (
                <div 
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: avatarBg }}
                >
                  <span className="text-white font-semibold text-xs">
                    {initials}
                  </span>
                </div>
              );
            }
            
            // Fallback to user avatar for non-artist conversations
            const senderUser = usersData.get(message.senderId);
            if (senderUser?.photoURL) {
              return (
                <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                  <Image
                    src={senderUser.photoURL}
                    alt={senderName}
                    width={24}
                    height={24}
                    className="object-cover"
                  />
                </div>
              );
            }
            
            // Final fallback: gradient avatar with initials
            const avatarBg = getAvatarGradient(senderName);
            const initials = getInitials(senderName);
            return (
              <div 
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: avatarBg }}
              >
                <span className="text-white font-semibold text-xs">
                  {initials}
                </span>
              </div>
            );
          };

          const senderAvatar = getSenderAvatar();

          return (
            <div
              key={message.id}
              className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${isGroupChat ? 'items-start' : 'items-end'} gap-2`}
            >
              {!isOwn && (isGroupChat || hasArtists) && senderAvatar && (
                <div className="flex-shrink-0 mt-1">
                  {senderAvatar}
                </div>
              )}
              <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[70%]`}>
                {(isGroupChat || hasArtists || !isOwn) && (
                  <span className={`text-xs opacity-70 mb-1 ${isOwn ? 'text-right' : 'text-left'}`}>
                    {senderName}
                  </span>
                )}
                <div
                  className={`rounded-lg px-4 py-2 ${
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
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <MessageComposer conversationId={conversationId} />
    </div>
  );
}
