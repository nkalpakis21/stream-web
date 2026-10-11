import { getInitials } from '@/lib/utils/avatar';

export const LISTENER_NAME = 'Listener';
export const LISTENER_INITIAL = 'L';

/** `getUserDisplayName` writes this when a profile has no name. */
const UID_FALLBACK_NAME = /^User\s+\S+(?:\.{3}|…)$/;

export function isUidFallbackName(value: string | null | undefined): boolean {
  const name = value?.trim() ?? '';
  return UID_FALLBACK_NAME.test(name);
}

/** Missing names and uid-shaped fallbacks are listeners. Real names pass through. */
export function commentAuthorName(displayName: string | null | undefined): string {
  const name = displayName?.trim() ?? '';
  if (!name || isUidFallbackName(name)) return LISTENER_NAME;
  return name;
}

export function commentAuthorInitial(displayName: string | null | undefined): string {
  const name = displayName?.trim() ?? '';
  if (!name || isUidFallbackName(name)) return LISTENER_INITIAL;
  return getInitials(name);
}

export interface CommentClientPayload {
  id: string;
  targetType: 'artist' | 'song';
  targetId: string;
  authorId: string;
  content: string;
  parentCommentId: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deleted: boolean;
}

/**
 * Fields the comments API may send. Name and avatar keys are dropped, including
 * a uid-derived "User xxxx…" fallback stored on a poisoned doc.
 */
export function commentClientPayload(raw: Record<string, unknown>): CommentClientPayload {
  const deleted = raw.deleted === true;
  const payload: CommentClientPayload = {
    id: typeof raw.id === 'string' ? raw.id : '',
    targetType: raw.targetType === 'artist' ? 'artist' : 'song',
    targetId: typeof raw.targetId === 'string' ? raw.targetId : '',
    authorId: deleted ? '' : typeof raw.authorId === 'string' ? raw.authorId : '',
    content: deleted ? '' : typeof raw.content === 'string' ? raw.content : '',
    parentCommentId: typeof raw.parentCommentId === 'string' ? raw.parentCommentId : null,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
    deletedAt: typeof raw.deletedAt === 'number' ? raw.deletedAt : null,
    deleted,
  };
  return payload;
}
