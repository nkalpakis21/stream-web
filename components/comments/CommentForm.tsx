'use client';

import { useState, FormEvent } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { createComment } from '@/lib/services/comments';
import { useToast, ToastContainer } from '@/components/ui/toast';
import { Send, X } from 'lucide-react';

interface CommentFormProps {
  targetType: 'artist' | 'song';
  targetId: string;
  parentCommentId?: string | null;
  onCommentAdded: (comment: {
    id: string;
    targetType: 'artist' | 'song';
    targetId: string;
    authorId: string;
    content: string;
    parentCommentId: string | null;
    createdAt: number;
    updatedAt: number;
    deletedAt: number | null;
  }) => void;
  onCancel?: () => void;
}

export function CommentForm({
  targetType,
  targetId,
  parentCommentId = null,
  onCommentAdded,
  onCancel,
}: CommentFormProps) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!user || !content.trim() || submitting) return;

    const commentContent = content.trim();
    setContent('');
    setSubmitting(true);

    try {
      const comment = await createComment(
        targetType,
        targetId,
        user.uid,
        commentContent,
        parentCommentId
      );

      onCommentAdded({
        ...comment,
        createdAt: comment.createdAt.toMillis(),
        updatedAt: comment.updatedAt.toMillis(),
        deletedAt: comment.deletedAt ? comment.deletedAt.toMillis() : null,
      });

      if (onCancel) {
        onCancel();
      }
    } catch (error) {
      console.error('Failed to create comment:', error);
      showToast('Failed to post comment', 'error');
      setContent(commentContent); // Restore content on error
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        Please sign in to comment
      </div>
    );
  }

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={parentCommentId ? 'Write a reply...' : 'Write a comment...'}
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          disabled={submitting}
          maxLength={2000}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {content.length}/2000
          </span>
          <div className="flex items-center gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!content.trim() || submitting}
              className="px-4 py-2 text-sm bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Posting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {parentCommentId ? 'Reply' : 'Post Comment'}
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
