'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { CommentThread } from './CommentThread';
import { CommentForm } from './CommentForm';
import { getComments, getReplies } from '@/lib/services/comments';
import type { CommentDocument } from '@/types/firestore';
import { MessageSquare } from 'lucide-react';

interface CommentsSectionProps {
  targetType: 'artist' | 'song';
  targetId: string;
}

// Serialized comment for client
type SerializedCommentDocument = Omit<CommentDocument, 'createdAt' | 'updatedAt' | 'deletedAt'> & {
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

export function CommentsSection({ targetType, targetId }: CommentsSectionProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<SerializedCommentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);

  const loadComments = useCallback(async (cursorParam: string | null = null) => {
    try {
      const result = await getComments(targetType, targetId, 20, cursorParam);
      
      const serialized = result.comments.map(comment => ({
        ...comment,
        createdAt: comment.createdAt.toMillis(),
        updatedAt: comment.updatedAt.toMillis(),
        deletedAt: comment.deletedAt ? comment.deletedAt.toMillis() : null,
      }));

      if (cursorParam) {
        setComments(prev => [...prev, ...serialized]);
      } else {
        setComments(serialized);
      }

      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleCommentAdded = (newComment: SerializedCommentDocument) => {
    setComments(prev => [newComment, ...prev]);
  };

  const handleCommentDeleted = (commentId: string) => {
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  const handleCommentUpdated = (updatedComment: SerializedCommentDocument) => {
    setComments(prev => prev.map(c => c.id === updatedComment.id ? updatedComment : c));
  };

  return (
    <div className="mt-12 border-t border-border pt-8">
      <div className="flex items-center gap-2 mb-6">
        <MessageSquare className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-2xl font-bold">Comments</h2>
        {comments.length > 0 && (
          <span className="text-sm text-muted-foreground">({comments.length})</span>
        )}
      </div>

      {user && (
        <div className="mb-8">
          <CommentForm
            targetType={targetType}
            targetId={targetId}
            onCommentAdded={handleCommentAdded}
          />
        </div>
      )}

      {loading && comments.length === 0 ? (
        <div className="py-8 text-center">
          <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-accent rounded-full animate-spin mx-auto" />
        </div>
      ) : comments.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          <p>No comments yet. Be the first to comment!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {comments.map(comment => (
            <CommentThread
              key={comment.id}
              comment={comment}
              targetType={targetType}
              targetId={targetId}
              onCommentDeleted={handleCommentDeleted}
              onCommentUpdated={handleCommentUpdated}
            />
          ))}
          
          {hasMore && (
            <button
              onClick={() => loadComments(cursor)}
              className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Load more comments...
            </button>
          )}
        </div>
      )}
    </div>
  );
}
