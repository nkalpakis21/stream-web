'use client';

import { commentAuthorInitial, commentAuthorName } from '@/lib/comments/author';
import '@/components/artists/artist-card.css';

/**
 * Comment author label. No display name renders as Listener with the
 * initials disc showing L. A uid fragment is never the label.
 */
export function CommentAuthor({
  displayName,
  loading = false,
  nameClassName = 'font-medium text-sm',
}: {
  displayName: string | null | undefined;
  loading?: boolean;
  nameClassName?: string;
}) {
  const pending = loading && !displayName?.trim();
  const name = pending ? '' : commentAuthorName(displayName);
  const initial = pending ? '' : commentAuthorInitial(displayName);

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="artist-index-face artist-face-card" aria-hidden="true">
        <span className="artist-index-face-initials">{initial}</span>
      </span>
      {name ? <span className={nameClassName}>{name}</span> : null}
    </span>
  );
}
