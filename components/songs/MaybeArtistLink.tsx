import Link from 'next/link';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';

/**
 * Artist name or coin cluster. Private artists are plain text with no tap target.
 */
export function MaybeArtistLink({
  artistId,
  linkable,
  className,
  style,
  children,
  onClick,
  dataEntity,
}: {
  artistId: string | null | undefined;
  linkable: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  onClick?: (event: MouseEvent) => void;
  dataEntity?: string;
}) {
  if (linkable && artistId) {
    return (
      <Link
        href={`/artists/${artistId}`}
        className={className}
        style={style}
        onClick={onClick}
        data-entity={dataEntity}
      >
        {children}
      </Link>
    );
  }

  return (
    <span className={className} style={style} data-entity={dataEntity}>
      {children}
    </span>
  );
}
