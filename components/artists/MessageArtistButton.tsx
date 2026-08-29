'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast, ToastContainer } from '@/components/ui/toast';
import { authHref } from '@/lib/auth/returnTo';

interface MessageArtistButtonProps {
  artistId: string;
  ownerId: string;
  className?: string;
}

export function MessageArtistButton({ artistId, ownerId, className = '' }: MessageArtistButtonProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();

  const isOwnArtist = user?.uid === ownerId;
  const buttonClass = `btn-ghost ${className}`.trim();

  const handleClick = async () => {
    if (loading || isOwnArtist) return;
    if (!user) return;

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
          artistId: artistId,
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
    return null;
  }

  if (!user) {
    return (
      <Link
        href={authHref('/signin', `/artists/${artistId}`)}
        className={buttonClass}
        aria-label="Sign in to message artist"
      >
        Message
      </Link>
    );
  }

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <button
        onClick={handleClick}
        disabled={loading}
        className={buttonClass}
        aria-label="Message artist owner"
      >
        {loading ? 'Starting...' : 'Message'}
      </button>
    </>
  );
}
