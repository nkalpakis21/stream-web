'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Nav } from '@/components/navigation/Nav';
import { ChatList } from '@/components/chat/ChatList';
import { ChatView } from '@/components/chat/ChatView';
import { NewChatModal } from '@/components/chat/NewChatModal';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast, ToastContainer } from '@/components/ui/toast';

function ChatPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();

  const handleCreateConversation = async (artistIds: string[], type: 'direct' | 'group' = 'direct') => {
    if (!user) return;

    try {
      // For artist conversations, we need to get the owner IDs
      // For now, we'll fetch the artists to get their ownerIds
      // In a direct chat with one artist, we create a conversation with the artist's owner
      if (artistIds.length === 0) {
        throw new Error('At least one artist is required');
      }

      // Fetch artists to get their ownerIds
      const artistsResponse = await fetch('/api/artists/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistIds }),
      });

      if (!artistsResponse.ok) {
        const errorData = await artistsResponse.json();
        throw new Error(errorData.error || 'Failed to fetch artists');
      }

      const artistsData = await artistsResponse.json();
      const artistData = artistsData.artists.map((artist: any) => ({
        artistId: artist.id,
        ownerId: artist.ownerId,
      }));
      const ownerIds = artistData.map((a: { artistId: string; ownerId: string }) => a.ownerId);
      
      // Ensure current user is included in participants
      const participants = [user.uid, ...ownerIds];
      const uniqueParticipants = Array.from(new Set(participants));

      // Validate participant count
      if (uniqueParticipants.length < 2) {
        throw new Error('At least one other participant is required');
      }

      // For direct chats, ensure exactly 2 participants and one artist
      const conversationType = uniqueParticipants.length === 2 && artistIds.length === 1 ? 'direct' : 'group';
      const artistId = artistIds.length === 1 ? artistIds[0] : undefined;

      const conversationResponse = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': user.uid, // Pass user ID for creator tracking
        },
        body: JSON.stringify({
          participants: uniqueParticipants,
          type: conversationType,
          artistId: artistId, // Pass artistId for artist-centric conversations
          artistIds: conversationType === 'group' ? artistIds : undefined, // Pass artistIds for group chats
        }),
      });

      if (!conversationResponse.ok) {
        const errorData = await conversationResponse.json();
        throw new Error(errorData.error || 'Failed to create conversation');
      }

      const conversationData = await conversationResponse.json();
      const conversationId = conversationData.conversation.id;
      
      setSelectedConversationId(conversationId);
      router.push(`/chat?conversationId=${conversationId}`, { scroll: false });
      showToast(
        conversationType === 'direct' 
          ? 'Conversation started' 
          : `Group chat started with ${artistIds.length} ${artistIds.length === 1 ? 'artist' : 'artists'}`,
        'success'
      );
    } catch (error) {
      console.error('Failed to create conversation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create conversation';
      showToast(errorMessage, 'error');
    }
  };

  // Handle URL query params on mount
  useEffect(() => {
    if (!user) return;

    const conversationIdParam = searchParams.get('conversationId');
    const userIdParam = searchParams.get('userId');

    if (conversationIdParam) {
      setSelectedConversationId(conversationIdParam);
    } else if (userIdParam) {
      // Create/find conversation with this user
      handleCreateConversation([userIdParam], 'direct');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, searchParams]);

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    router.push(`/chat?conversationId=${conversationId}`, { scroll: false });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Nav />
        <main className="max-w-7xl mx-auto px-6 lg:px-8 py-8 lg:py-12">
          <div className="text-center">
            <p className="text-lg text-muted-foreground mb-4">
              Please sign in to use chat
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-7xl mx-auto px-6 lg:px-8 py-8 lg:py-12">
        <div className="mb-8">
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-2">Chat</h1>
          <p className="text-lg text-muted-foreground">
            Direct messages and group chats
          </p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-300px)] min-h-[600px]">
          <div className="lg:col-span-1 border border-border rounded-lg bg-card overflow-hidden">
            <ChatList
              selectedConversationId={selectedConversationId}
              onSelectConversation={handleSelectConversation}
              onNewChat={() => setShowNewChatModal(true)}
            />
          </div>
          
          <div className="lg:col-span-2 border border-border rounded-lg bg-card overflow-hidden">
            <ChatView conversationId={selectedConversationId} />
          </div>
        </div>
      </main>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {showNewChatModal && (
        <NewChatModal
          isOpen={showNewChatModal}
          onClose={() => setShowNewChatModal(false)}
          onStartChat={handleCreateConversation}
        />
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background">
        <Nav />
        <main className="max-w-7xl mx-auto px-6 lg:px-8 py-8 lg:py-12">
          <div className="text-center">
            <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-accent rounded-full animate-spin mx-auto" />
          </div>
        </main>
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  );
}
