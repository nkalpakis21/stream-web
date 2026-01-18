'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Nav } from '@/components/navigation/Nav';
import { ChatList } from '@/components/chat/ChatList';
import { ChatView } from '@/components/chat/ChatView';
import { NewChatModal } from '@/components/chat/NewChatModal';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast, ToastContainer } from '@/components/ui/toast';

export default function ChatPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();

  const handleCreateConversation = async (otherUserIds: string[], type: 'direct' | 'group' = 'direct') => {
    if (!user) return;

    try {
      // Ensure current user is included in participants
      const participants = [user.uid, ...otherUserIds];
      const uniqueParticipants = Array.from(new Set(participants));

      // Validate participant count
      if (uniqueParticipants.length < 2) {
        throw new Error('At least one other participant is required');
      }

      // For direct chats, ensure exactly 2 participants
      const conversationType = uniqueParticipants.length === 2 ? 'direct' : 'group';

      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participants: uniqueParticipants,
          type: conversationType,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create conversation');
      }

      const data = await response.json();
      const conversationId = data.conversation.id;
      
      setSelectedConversationId(conversationId);
      router.push(`/chat?conversationId=${conversationId}`, { scroll: false });
      showToast(
        conversationType === 'direct' 
          ? 'Conversation started' 
          : `Group chat started with ${uniqueParticipants.length - 1} ${uniqueParticipants.length === 2 ? 'person' : 'people'}`,
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
