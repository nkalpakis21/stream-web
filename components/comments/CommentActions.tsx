'use client';

import { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { updateComment, deleteComment } from '@/lib/services/comments';
import { useToast } from '@/components/ui/toast';
import { Edit2, Trash2, X, Check } from 'lucide-react';

interface CommentActionsProps {
  comment: {
    id: string;
    content: string;
    authorId: string;
    createdAt: number;
    updatedAt: number;
    deletedAt: number | null;
  };
  onCommentDeleted: (commentId: string) => void;
  onCommentUpdated: (comment: CommentActionsProps['comment']) => void;
}

export function CommentActions({
  comment,
  onCommentDeleted,
  onCommentUpdated,
}: CommentActionsProps) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [deleting, setDeleting] = useState(false);
  const { showToast } = useToast();

  if (!user || user.uid !== comment.authorId) {
    return null;
  }

  const handleUpdate = async () => {
    if (!editContent.trim() || editContent === comment.content) {
      setEditing(false);
      return;
    }

    try {
      await updateComment(comment.id, user.uid, editContent);
      onCommentUpdated({
        ...comment,
        content: editContent,
        updatedAt: Date.now(),
      });
      setEditing(false);
      showToast('Comment updated', 'success');
    } catch (error) {
      console.error('Failed to update comment:', error);
      showToast('Failed to update comment', 'error');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this comment?')) {
      return;
    }

    setDeleting(true);
    try {
      await deleteComment(comment.id, user.uid);
      onCommentDeleted(comment.id);
      showToast('Comment deleted', 'success');
    } catch (error) {
      console.error('Failed to delete comment:', error);
      showToast('Failed to delete comment', 'error');
      setDeleting(false);
    }
  };

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          maxLength={2000}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleUpdate}
            className="px-3 py-1.5 text-xs bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors flex items-center gap-1"
          >
            <Check className="w-3 h-3" />
            Save
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setEditContent(comment.content);
            }}
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setEditing(true)}
        disabled={deleting}
        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        aria-label="Edit comment"
      >
        <Edit2 className="w-3 h-3" />
      </button>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50"
        aria-label="Delete comment"
      >
        {deleting ? (
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <Trash2 className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}
