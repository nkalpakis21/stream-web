'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { getConversation } from '@/lib/services/conversations';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getUserPath, getArtistPath } from '@/lib/firebase/collections';
import type { ConversationDocument, UserDocument, AIArtistDocument } from '@/types/firestore';
import { Users, MessageCircle } from 'lucide-react';
import Image from 'next/image';
import { getAvatarGradient, getInitials } from '@/lib/utils/avatar';

interface ConversationHeaderProps {
  conversationId: string;
}

export function ConversationHeader({ conversationId }: ConversationHeaderProps) {
  const { user } = useAuth();
  const [conversation, setConversation] = useState<ConversationDocument | null>(null);
  const [participantNames, setParticipantNames] = useState<Map<string, string>>(new Map());
  const [artist, setArtist] = useState<AIArtistDocument | null>(null);

  useEffect(() => {
    const loadConversation = async () => {
      try {
        const conv = await getConversation(conversationId);
        if (!conv) return;

        setConversation(conv);

        // If conversation has artistId, load artist info
        if (conv.artistId) {
          try {
            const artistRef = doc(db, getArtistPath(conv.artistId));
            const artistDoc = await getDoc(artistRef);
            if (artistDoc.exists()) {
              const artistData = artistDoc.data() as AIArtistDocument;
              setArtist(artistData);
            }
          } catch (error) {
            console.error('Failed to load artist:', error);
          }
        }

        // Load participant names (for fallback or group chats)
        const names = new Map<string, string>();
        for (const participantId of conv.participants) {
          if (participantId === user?.uid) {
            names.set(participantId, 'You');
            continue;
          }
          try {
            const userRef = doc(db, getUserPath(participantId));
            const userDoc = await getDoc(userRef);
            if (userDoc.exists()) {
              const participant = userDoc.data() as UserDocument;
              names.set(participantId, participant.displayName || participant.email);
            } else {
              names.set(participantId, `User ${participantId.substring(0, 8)}...`);
            }
          } catch (error) {
            names.set(participantId, `User ${participantId.substring(0, 8)}...`);
          }
        }
        setParticipantNames(names);
      } catch (error) {
        console.error('Failed to load conversation:', error);
      }
    };

    loadConversation();
  }, [conversationId, user]);

  if (!conversation) {
    return (
      <div className="border-b border-border p-4">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const otherParticipants = conversation.participants.filter(id => id !== user?.uid);
  
  // Use artist name if available, otherwise fall back to participant names
  let displayName: string;
  let avatarElement: React.ReactNode;
  
  if (artist) {
    displayName = artist.name;
    const avatarBg = getAvatarGradient(artist.name);
    const initials = getInitials(artist.name);
    
    avatarElement = artist.avatarURL ? (
      <div className="w-8 h-8 rounded-full overflow-hidden">
        <Image
          src={artist.avatarURL}
          alt={artist.name}
          width={32}
          height={32}
          className="object-cover"
        />
      </div>
    ) : (
      <div 
        className="w-8 h-8 rounded-full flex items-center justify-center"
        style={{ background: avatarBg }}
      >
        <span className="text-white font-semibold text-xs">
          {initials}
        </span>
      </div>
    );
  } else if (conversation.type === 'direct') {
    displayName = participantNames.get(otherParticipants[0] || '') || 'Unknown User';
    avatarElement = <MessageCircle className="w-5 h-5 text-muted-foreground" />;
  } else {
    displayName = `Group Chat (${conversation.participants.length})`;
    avatarElement = <Users className="w-5 h-5 text-muted-foreground" />;
  }

  return (
    <div className="border-b border-border p-4 flex items-center gap-3">
      {avatarElement}
      <h2 className="text-lg font-semibold">{displayName}</h2>
      {conversation.type === 'group' && (
        <span className="text-sm text-muted-foreground">
          {conversation.participants.length} {conversation.participants.length === 1 ? 'member' : 'members'}
        </span>
      )}
    </div>
  );
}
