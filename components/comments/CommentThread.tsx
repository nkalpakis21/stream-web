'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { CommentForm } from './CommentForm';
import { CommentActions } from './CommentActions';
import { getReplies } from '@/lib/services/comments';
import { useUserDisplayName, useUsersDisplayNames } from '@/hooks/useUserDisplayName';
import type { CommentDocument } from '@/types/firestore';
import { formatDistanceToNow } from 'date-fns';
import { Reply } from 'lucide-react';

interface CommentThreadProps {
  comment: Omit<CommentDocument, 'createdAt' | 'updatedAt' | 'deletedAt'> & {
    createdAt: number;
    updatedAt: number;
    deletedAt: number | null;
  };
  targetType: 'artist' | 'song';
  targetId: string;
  onCommentDeleted: (commentId: string) => void;
  onCommentUpdated: (comment: CommentThreadProps['comment']) => void;
}

type SerializedCommentDocument = CommentThreadProps['comment'];

export function CommentThread({
  comment,
  targetType,
  targetId,
  onCommentDeleted,
  onCommentUpdated,
}: CommentThreadProps) {
  const { user } = useAuth();
  const [replies, setReplies] = useState<SerializedCommentDocument[]>([]);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState(false);
  
  // Fetch display names
  const { displayName: authorDisplayName } = useUserDisplayName(comment.authorId);
  const replyAuthorIds = replies.map(r => r.authorId);
  const { displayNames: replyDisplayNames } = useUsersDisplayNames(replyAuthorIds);

  const loadReplies = async () => {
    if (replies.length > 0 || loadingReplies) return;
    
    setLoadingReplies(true);
    try {
      const result = await getReplies(comment.id, 50, null);
      setReplies(
        result.replies.map(reply => ({
          ...reply,
          createdAt: reply.createdAt.toMillis(),
          updatedAt: reply.updatedAt.toMillis(),
          deletedAt: reply.deletedAt ? reply.deletedAt.toMillis() : null,
        }))
      );
    } catch (error) {
      console.error('Failed to load replies:', error);
    } finally {
      setLoadingReplies(false);
    }
  };

  const handleReplyAdded = (newReply: SerializedCommentDocument) => {
    setReplies(prev => [...prev, newReply]);
    setShowReplyForm(false);
  };

  const handleReplyDeleted = (replyId: string) => {
    setReplies(prev => prev.filter(r => r.id !== replyId));
  };

  const handleReplyUpdated = (updatedReply: SerializedCommentDocument) => {
    setReplies(prev => prev.map(r => r.id === updatedReply.id ? updatedReply : r));
  };

  return (
    <div className="border-b border-border pb-6 last:border-b-0">
      <div className="flex gap-3">
        <div className="flex-1">
          <div className="flex items-start justify-between mb-2">
            <div>
              <span className="font-medium text-sm">
                {authorDisplayName || `User ${comment.authorId.substring(0, 8)}...`}
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
              </span>
            </div>
            {user && user.uid === comment.authorId && (
              <CommentActions
                comment={comment}
                onCommentDeleted={onCommentDeleted}
                onCommentUpdated={onCommentUpdated}
              />
            )}
          </div>
          
          <p className="text-sm text-foreground whitespace-pre-wrap break-words mb-3">
            {comment.content}
          </p>

          {user && (
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  if (!showReplyForm) {
                    loadReplies();
                  }
                  setShowReplyForm(!showReplyForm);
                }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Reply className="w-3 h-3" />
                Reply
              </button>
              {replies.length > 0 && (
                <button
                  onClick={loadReplies}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                </button>
              )}
            </div>
          )}

          {showReplyForm && (
            <div className="mt-4 ml-4 pl-4 border-l-2 border-border">
              <CommentForm
                targetType={targetType}
                targetId={targetId}
                parentCommentId={comment.id}
                onCommentAdded={handleReplyAdded}
                onCancel={() => setShowReplyForm(false)}
              />
            </div>
          )}

          {replies.length > 0 && (
            <div className="mt-4 ml-4 pl-4 border-l-2 border-border space-y-4">
              {replies.map(reply => {
                const replyAuthorName = replyDisplayNames.get(reply.authorId) || `User ${reply.authorId.substring(0, 8)}...`;
                return (
                  <div key={reply.id} className="pb-4 last:pb-0">
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <span className="font-medium text-xs">{replyAuthorName}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    {user && user.uid === reply.authorId && (
                      <CommentActions
                        comment={reply}
                        onCommentDeleted={handleReplyDeleted}
                        onCommentUpdated={handleReplyUpdated}
                      />
                    )}
                  </div>
                    <p className="text-xs text-foreground whitespace-pre-wrap break-words">
                      {reply.content}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
