'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { getConversation } from '@/lib/services/conversations';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getUserPath } from '@/lib/firebase/collections';
import type { ConversationDocument, UserDocument } from '@/types/firestore';
import { Users, MessageCircle } from 'lucide-react';

interface ConversationHeaderProps {
  conversationId: string;
}

export function ConversationHeader({ conversationId }: ConversationHeaderProps) {
  const { user } = useAuth();
  const [conversation, setConversation] = useState<ConversationDocument | null>(null);
  const [participantNames, setParticipantNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const loadConversation = async () => {
      try {
        const conv = await getConversation(conversationId);
        if (!conv) return;

        setConversation(conv);

        // Load participant names
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
  const displayName = conversation.type === 'direct'
    ? participantNames.get(otherParticipants[0] || '') || 'Unknown User'
    : `Group Chat (${conversation.participants.length})`;

  return (
    <div className="border-b border-border p-4 flex items-center gap-3">
      {conversation.type === 'group' ? (
        <Users className="w-5 h-5 text-muted-foreground" />
      ) : (
        <MessageCircle className="w-5 h-5 text-muted-foreground" />
      )}
      <h2 className="text-lg font-semibold">{displayName}</h2>
      {conversation.type === 'group' && (
        <span className="text-sm text-muted-foreground">
          {conversation.participants.length} {conversation.participants.length === 1 ? 'member' : 'members'}
        </span>
      )}
    </div>
  );
}
