import type { ReactNode } from 'react';

/** Cover on top. Beat rows sit in `below`, directly under the art. */
export function SongCoverStack({
  cover,
  below,
}: {
  cover: ReactNode;
  below?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      {cover}
      {below ? (
        <div className="mt-4" data-below-cover>
          {below}
        </div>
      ) : null}
    </div>
  );
}
