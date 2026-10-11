/**
 * Placeholder for a deleted comment that still has replies.
 * Figtree, secondary grey. No avatar, name, or timestamp.
 */
export function DeletedCommentLine() {
  return (
    <p
      className="comment-deleted"
      style={{
        fontFamily: 'var(--font-figtree), system-ui, sans-serif',
        color: 'var(--mute)',
        margin: 0,
      }}
    >
      Comment deleted
    </p>
  );
}
