import { notFound } from 'next/navigation';
import { artistIsVisible, type ArtistVisibilityInput } from '@/lib/artists/visibility';

/**
 * Hidden artists render through notFound(), which Next answers with HTTP 404.
 * Returning the dead-end screen from the page would be a 200.
 */
export function rejectHiddenArtist<T extends ArtistVisibilityInput>(
  artist: T | null | undefined,
  viewerId: string | null | undefined
): asserts artist is T {
  if (!artist || !artistIsVisible(artist, viewerId)) {
    notFound();
  }
}
