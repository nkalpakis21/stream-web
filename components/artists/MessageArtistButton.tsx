'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast, ToastContainer } from '@/components/ui/toast';
import { MessageCircle, Loader2 } from 'lucide-react';

interface MessageArtistButtonProps {
  artistId: string;
  ownerId: string;
}

export function MessageArtistButton({ artistId, ownerId }: MessageArtistButtonProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();

  const isOwnArtist = user?.uid === ownerId;

  const handleClick = async () => {
    if (!user || loading || isOwnArtist) return;

    setLoading(true);
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': user.uid,
        },
        body: JSON.stringify({
          participants: [user.uid, ownerId],
          type: 'direct',
          artistId: artistId, // Pass artistId to create artist-centric conversation
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create conversation');
      }

      const data = await response.json();
      const conversationId = data.conversation.id;
      
      router.push(`/chat?conversationId=${conversationId}`);
      showToast('Conversation started', 'success');
    } catch (error) {
      console.error('Failed to create conversation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start conversation';
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (isOwnArtist) {
    return null; // Don't show button for own artist
  }

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <button
        onClick={handleClick}
        disabled={loading || !user}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Message artist owner"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Starting...</span>
          </>
        ) : (
          <>
            <MessageCircle className="w-4 h-4" />
            <span className="text-sm">Message</span>
          </>
        )}
      </button>
    </>
  );
}
