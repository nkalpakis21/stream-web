'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { getConversation } from '@/lib/services/conversations';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getUserPath } from '@/lib/firebase/collections';
import { fetchArtistCardDisplays } from '@/lib/artists/fetchCardDisplay';
import type { ArtistCardDisplay } from '@/lib/artists/cardDisplay';
import { ArtistFace } from '@/components/artists/ArtistFace';
import type { ConversationDocument, UserDocument } from '@/types/firestore';
import { Users, MessageCircle, Edit2, Check, X, Loader2 } from 'lucide-react';
import { useToast, ToastContainer } from '@/components/ui/toast';
import { getFreshIdToken } from '@/lib/api/clientAuth';

interface ConversationHeaderProps {
  conversationId: string;
}

export function ConversationHeader({ conversationId }: ConversationHeaderProps) {
  const { user } = useAuth();
  const [conversation, setConversation] = useState<ConversationDocument | null>(null);
  const [participantNames, setParticipantNames] = useState<Map<string, string>>(new Map());
  const [artist, setArtist] = useState<ArtistCardDisplay | null>(null);
  const [groupArtists, setGroupArtists] = useState<ArtistCardDisplay[]>([]);
  const [title, setTitle] = useState<string>('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();

  useEffect(() => {
    const loadConversation = async () => {
      try {
        const conv = await getConversation(conversationId);
        if (!conv) return;

        setConversation(conv);
        setTitle(conv.title || '');

        // Names and photos only. A private artist stays a display, not a document.
        const displayIds = [
          ...(conv.artistId ? [conv.artistId] : []),
          ...(conv.artistIds ?? []),
        ];
        if (displayIds.length > 0) {
          try {
            const displays = await fetchArtistCardDisplays(displayIds);
            setArtist(conv.artistId ? displays.get(conv.artistId) ?? null : null);
            setGroupArtists(
              (conv.artistIds ?? [])
                .map(artistId => displays.get(artistId))
                .filter((item): item is ArtistCardDisplay => Boolean(item))
            );
          } catch (error) {
            console.error('Failed to load artists:', error);
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
              names.set(
                participantId,
                participant.displayName || `User ${participantId.substring(0, 8)}...`
              );
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

  // Update title when conversation changes
  useEffect(() => {
    if (conversation) {
      setTitle(conversation.title || '');
    }
  }, [conversation]);

  if (!conversation) {
    return (
      <div className="border-b border-border p-4">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const otherParticipants = conversation.participants.filter(id => id !== user?.uid);
  const isCreator = conversation.createdBy === user?.uid;
  
  // Use artist name if available, otherwise fall back to participant names
  let displayName: string;
  let avatarElement: React.ReactNode;
  
  if (artist) {
    displayName = artist.name;
    avatarElement = (
      <ArtistFace name={artist.name} sources={artist.photoUrl ? [artist.photoUrl] : []} size="row" />
    );
  } else if (conversation.type === 'direct') {
    displayName = participantNames.get(otherParticipants[0] || '') || 'Unknown User';
    avatarElement = <MessageCircle className="w-5 h-5 text-muted-foreground" />;
  } else {
    // For group chats, use custom title or default
    displayName = conversation.title || `Group Chat (${conversation.participants.length})`;
    avatarElement = <Users className="w-5 h-5 text-muted-foreground" />;
  }

  const handleSaveTitle = async () => {
    if (!user || savingTitle) return;

    const trimmed = title.trim();

    // Validation
    if (trimmed.length === 0) {
      showToast('Title cannot be empty', 'error');
      return;
    }

    if (trimmed.length > 100) {
      showToast('Title must be 100 characters or less', 'error');
      return;
    }

    const allowedPattern = /^[a-zA-Z0-9\s\-_]+$/;
    if (!allowedPattern.test(trimmed)) {
      showToast('Title can only contain letters, numbers, spaces, hyphens, and underscores', 'error');
      return;
    }

    // Check if unchanged
    if (trimmed === conversation?.title) {
      setEditingTitle(false);
      return;
    }

    setSavingTitle(true);
    try {
      const token = await getFreshIdToken(user);
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'update_title',
          title: trimmed,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update conversation title');
      }

      setEditingTitle(false);
      if (conversation) {
        setConversation({ ...conversation, title: trimmed });
      }
      showToast('Conversation title updated successfully', 'success');
    } catch (error) {
      console.error('Failed to update conversation title:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update conversation title';
      showToast(errorMessage, 'error');
    } finally {
      setSavingTitle(false);
    }
  };

  const handleCancelTitle = () => {
    setTitle(conversation?.title || '');
    setEditingTitle(false);
  };

  // Get artist names for meta display
  const artistNames = groupArtists.length > 0 
    ? groupArtists.map(a => a.name).join(', ')
    : null;

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-3 mb-2">
          {avatarElement}
          <div className="flex-1 min-w-0">
            {conversation.type === 'group' && editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter group chat title"
                  maxLength={100}
                  className="px-3 py-1.5 text-lg font-semibold border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent flex-1"
                  disabled={savingTitle}
                  autoFocus
                />
                <button
                  onClick={handleSaveTitle}
                  disabled={savingTitle || !title.trim()}
                  className="p-1.5 text-accent hover:bg-accent/10 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Save"
                >
                  {savingTitle ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={handleCancelTitle}
                  disabled={savingTitle}
                  className="p-1.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  aria-label="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{displayName}</h2>
                {conversation.type === 'group' && isCreator && !editingTitle && (
                  <button
                    onClick={() => setEditingTitle(true)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-xl hover:bg-muted"
                    aria-label="Edit group chat title"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {conversation.type === 'group' && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {conversation.participants.length} {conversation.participants.length === 1 ? 'member' : 'members'}
            </span>
            {artistNames && (
              <>
                <span className="text-sm text-muted-foreground">•</span>
                <span className="text-sm text-muted-foreground">{artistNames}</span>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
