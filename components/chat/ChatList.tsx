'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getUserConversations } from '@/lib/services/conversations';
import { useUsersDisplayNames } from '@/hooks/useUserDisplayName';
import type { ConversationDocument, AIArtistDocument } from '@/types/firestore';
import { formatDistanceToNow } from 'date-fns';
import { MessageCircle, Users, Plus } from 'lucide-react';
import Image from 'next/image';
import { getAvatarGradient, getInitials } from '@/lib/utils/avatar';

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
  const [artists, setArtists] = useState<Map<string, AIArtistDocument>>(new Map());

  // Get all artist IDs from conversations
  const artistIds = useMemo(() => {
    return conversations
      .filter(conv => conv.artistId)
      .map(conv => conv.artistId!)
      .filter((id, index, self) => self.indexOf(id) === index); // Unique
  }, [conversations]);

  // Fetch artists for conversations
  useEffect(() => {
    if (artistIds.length === 0) {
      setArtists(new Map());
      return;
    }

    const fetchArtists = async () => {
      try {
        const response = await fetch('/api/artists/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ artistIds }),
        });

        if (!response.ok) {
          console.error('Failed to fetch artists');
          return;
        }

        const data = await response.json();
        const artistsMap = new Map<string, AIArtistDocument>();
        data.artists.forEach((artist: any) => {
          // Convert serialized artist back to AIArtistDocument format
          artistsMap.set(artist.id, {
            ...artist,
            createdAt: Timestamp.fromMillis(artist.createdAt),
            updatedAt: Timestamp.fromMillis(artist.updatedAt),
            deletedAt: artist.deletedAt ? Timestamp.fromMillis(artist.deletedAt) : null,
          } as AIArtistDocument);
        });
        setArtists(artistsMap);
      } catch (error) {
        console.error('Failed to fetch artists:', error);
      }
    };

    fetchArtists();
  }, [artistIds]);

  // Get all participant IDs from direct conversations without artistId for fallback
  const directConversationParticipantIds = useMemo(() => {
    return conversations
      .filter(conv => conv.type === 'direct' && !conv.artistId)
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
      
      {conversations.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
          <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="mb-4">No conversations yet</p>
          <button
            onClick={onNewChat}
            className="px-4 py-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Start a new chat</span>
          </button>
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto">
        {conversations.map(conv => {
          // For artist conversations, show artist name
          let displayName: string;
          let avatarElement: React.ReactNode;
          
          if (conv.artistId && artists.has(conv.artistId)) {
            const artist = artists.get(conv.artistId)!;
            displayName = artist.name;
            const avatarBg = getAvatarGradient(artist.name);
            const initials = getInitials(artist.name);
            
            avatarElement = artist.avatarURL ? (
              <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden">
                <Image
                  src={artist.avatarURL}
                  alt={artist.name}
                  width={40}
                  height={40}
                  className="object-cover"
                />
              </div>
            ) : (
              <div 
                className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: avatarBg }}
              >
                <span className="text-white font-semibold text-sm">
                  {initials}
                </span>
              </div>
            );
          } else if (conv.type === 'direct') {
            // Fallback to user display name for old conversations
            const otherParticipants = conv.participants.filter(id => id !== user?.uid);
            displayName = otherParticipants[0] 
              ? (displayNames.get(otherParticipants[0]) || `User ${otherParticipants[0].substring(0, 8)}...`) 
              : 'Unknown User';
            avatarElement = (
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-accent" />
              </div>
            );
          } else {
            displayName = `Group (${conv.participants.length})`;
            avatarElement = (
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-accent" />
              </div>
            );
          }

          return (
            <button
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              className={`w-full p-4 text-left border-b border-border hover:bg-muted/50 transition-colors ${
                selectedConversationId === conv.id ? 'bg-muted' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                {avatarElement}
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
      )}
    </div>
  );
}
