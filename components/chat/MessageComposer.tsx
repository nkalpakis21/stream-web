'use client';

import { useState, FormEvent } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { sendMessage } from '@/lib/services/messages';
import { useToast } from '@/components/ui/toast';
import { Send } from 'lucide-react';

interface MessageComposerProps {
  conversationId: string;
}

export function MessageComposer({ conversationId }: MessageComposerProps) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const { showToast } = useToast();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!user || !content.trim() || sending) return;

    const messageContent = content.trim();
    setContent('');
    setSending(true);

    try {
      await sendMessage(conversationId, user.uid, messageContent);
    } catch (error) {
      console.error('Failed to send message:', error);
      showToast('Failed to send message', 'error');
      setContent(messageContent); // Restore content on error
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="border-t border-border p-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 resize-none rounded-lg border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          disabled={sending || !user}
          maxLength={5000}
        />
        <button
          type="submit"
          disabled={!content.trim() || sending || !user}
          className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {sending ? (
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>
    </div>
  );
}
