'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { CommentForm } from './CommentForm';
import { CommentActions } from './CommentActions';
import { DeletedCommentLine } from './DeletedCommentLine';
import { CommentAuthor } from './CommentAuthor';
import { getReplies } from '@/lib/services/comments';
import type { CommentDeleteOutcome } from '@/lib/comments/live';
import { useUserDisplayName, useUsersDisplayNames } from '@/hooks/useUserDisplayName';
import type { CommentDocument } from '@/types/firestore';
import { formatDistanceToNow } from 'date-fns';
import { Reply } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { authHref } from '@/lib/auth/returnTo';

interface CommentThreadProps {
  comment: Omit<CommentDocument, 'createdAt' | 'updatedAt' | 'deletedAt'> & {
    createdAt: number;
    updatedAt: number;
    deletedAt: number | null;
  };
  targetType: 'artist' | 'song';
  targetId: string;
  onCommentDeleted: (commentId: string, outcome: CommentDeleteOutcome) => void;
  onCommentUpdated: (comment: CommentThreadProps['comment']) => void;
  onLiveCommentsChanged?: () => void;
}

type SerializedCommentDocument = CommentThreadProps['comment'];

export function CommentThread({
  comment,
  targetType,
  targetId,
  onCommentDeleted,
  onCommentUpdated,
  onLiveCommentsChanged,
}: CommentThreadProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [replies, setReplies] = useState<SerializedCommentDocument[]>([]);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [repliesLoaded, setRepliesLoaded] = useState(false);
  const repliesLoadedRef = useRef(false);
  
  // Fetch display names. Tombstones have no author.
  const { displayName: authorDisplayName, loading: authorLoading } = useUserDisplayName(
    comment.deleted ? null : comment.authorId
  );
  const replyAuthorIds = replies.map(r => (r.deleted ? null : r.authorId));
  const { displayNames: replyDisplayNames, loading: replyNamesLoading } =
    useUsersDisplayNames(replyAuthorIds);

  const loadReplies = useCallback(async () => {
    if (repliesLoadedRef.current) return;
    repliesLoadedRef.current = true;
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
      setRepliesLoaded(true);
    } catch (error) {
      repliesLoadedRef.current = false;
      console.error('Failed to load replies:', error);
    }
  }, [comment.id]);

  useEffect(() => {
    if (comment.deleted) {
      void loadReplies();
    }
  }, [comment.deleted, loadReplies]);

  const handleReplyAdded = (newReply: SerializedCommentDocument) => {
    setReplies(prev => [...prev, newReply]);
    setShowReplyForm(false);
    onLiveCommentsChanged?.();
  };

  const handleReplyDeleted = (replyId: string, outcome: CommentDeleteOutcome) => {
    setReplies(prev => {
      if (outcome === 'tombstone') {
        return prev.map(reply =>
          reply.id === replyId
            ? { ...reply, deleted: true, authorId: '', content: '' }
            : reply
        );
      }
      return prev.filter(reply => reply.id !== replyId);
    });
    onLiveCommentsChanged?.();
  };

  const handleReplyUpdated = (updatedReply: SerializedCommentDocument) => {
    setReplies(prev => prev.map(r => r.id === updatedReply.id ? updatedReply : r));
  };

  if (comment.deleted && repliesLoaded && replies.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-border pb-6 last:border-b-0">
      <div className="flex gap-3">
        <div className="flex-1">
          {comment.deleted ? (
            <DeletedCommentLine />
          ) : (
            <>
              <div className="flex items-start justify-between mb-2">
                <div className="flex min-w-0 items-center">
                  <CommentAuthor displayName={authorDisplayName} loading={authorLoading} />
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
            </>
          )}

          {!comment.deleted && user ? (
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
          ) : !comment.deleted ? (
            <Link
              href={authHref('/signin', pathname)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Reply className="w-3 h-3" />
              Reply
            </Link>
          ) : null}

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
                if (reply.deleted) {
                  return (
                    <div key={reply.id} className="pb-4 last:pb-0">
                      <DeletedCommentLine />
                    </div>
                  );
                }
                const replyAuthorName = replyDisplayNames.get(reply.authorId) ?? null;
                return (
                  <div key={reply.id} className="pb-4 last:pb-0">
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex min-w-0 items-center">
                        <CommentAuthor
                          displayName={replyAuthorName}
                          loading={replyNamesLoading && !replyDisplayNames.has(reply.authorId)}
                          nameClassName="font-medium text-xs"
                        />
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
