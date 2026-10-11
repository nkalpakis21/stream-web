/** A tombstone or a soft-deleted row is not a live comment. */
export function isLiveCommentData(
  data: { deleted?: unknown; deletedAt?: unknown } | null | undefined
): boolean {
  if (!data) return false;
  if (data.deleted === true) return false;
  if (data.deletedAt) return false;
  return true;
}

export type CommentDeleteOutcome = 'removed' | 'tombstone';

/** Every live comment on a target, replies included. Tombstones do not count. */
export function countLiveComments(
  comments: ReadonlyArray<{ deleted?: unknown; deletedAt?: unknown } | null | undefined>
): number {
  return comments.filter(comment => isLiveCommentData(comment)).length;
}
