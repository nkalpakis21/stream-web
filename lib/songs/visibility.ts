import { notFound } from 'next/navigation';

/**
 * Who may open a song page or a song-by-id payload.
 * Public songs are visible. A private song is visible only to its verified owner.
 * A deleted song is visible to no one.
 */
export interface SongVisibilityInput {
  isPublic?: unknown;
  deletedAt?: unknown;
  ownerId?: unknown;
  title?: unknown;
  audioReady?: unknown;
}

export function songIsVisible<T extends SongVisibilityInput>(
  song: T | null | undefined,
  viewerId: string | null | undefined
): song is T {
  if (!song || song.deletedAt) return false;
  const owner =
    typeof viewerId === 'string' && viewerId.length > 0 && song.ownerId === viewerId;
  if (owner) return true;
  // A shell waiting on its first file stays off the public page.
  return song.isPublic === true && song.audioReady !== false;
}

/**
 * Hidden songs render through notFound(), which Next answers with HTTP 404.
 * Returning the dead-end screen from the page would be a 200.
 */
export function rejectHiddenSong<T extends SongVisibilityInput>(
  song: T | null | undefined,
  viewerId: string | null | undefined
): asserts song is T {
  if (!songIsVisible(song, viewerId)) {
    notFound();
  }
}

/**
 * Private songs stay out of the title and social tags, including for the owner.
 * The owner still gets the page. Crawlers get a generic noindex document.
 */
export function hiddenSongPageMetadata() {
  const description = "This song isn't on Streamstar.";
  return {
    title: 'Song',
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title: 'Song',
      description,
      images: [] as string[],
    },
    twitter: {
      card: 'summary' as const,
      title: 'Song',
      description,
      images: [] as string[],
    },
  };
}
