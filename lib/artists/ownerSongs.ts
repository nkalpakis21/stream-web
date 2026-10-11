/**
 * Artist-page song visibility.
 * Fans and signed-out viewers only receive public songs.
 * The verified owner receives every non-deleted song they own, public and private,
 * in the same newest-first order. Private rows are tagged only on that owner view.
 */

export interface ArtistSongVisibility {
  id?: string;
  artistId?: unknown;
  ownerId?: unknown;
  isPublic?: unknown;
  deletedAt?: unknown;
  createdAt?: unknown;
}

export function isArtistOwner(
  viewerId: string | null | undefined,
  ownerId: string | null | undefined
): boolean {
  return typeof viewerId === 'string' && viewerId.length > 0 && viewerId === ownerId;
}

function createdAtMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (value && typeof value === 'object') {
    const record = value as { toMillis?: () => unknown; toDate?: () => unknown };
    if (typeof record.toMillis === 'function') {
      const ms = record.toMillis.call(value);
      if (typeof ms === 'number' && Number.isFinite(ms)) return ms;
    }
    if (typeof record.toDate === 'function') {
      const date = record.toDate.call(value);
      if (date instanceof Date) {
        const ms = date.getTime();
        if (Number.isFinite(ms)) return ms;
      }
    }
  }
  return 0;
}

/**
 * Second gate after the fetch. Owner queries may include private songs;
 * every other viewer drops them even if a private document was in the array.
 */
export function selectArtistPageSongs<T extends ArtistSongVisibility>(
  songs: readonly T[],
  viewerId: string | null | undefined,
  ownerId: string,
  artistId?: string
): T[] {
  const ownerView = isArtistOwner(viewerId, ownerId);
  return songs
    .filter(song => {
      if (song.deletedAt) return false;
      if (artistId && song.artistId != null && song.artistId !== artistId) return false;
      if (typeof song.ownerId === 'string' && song.ownerId !== ownerId) return false;
      if (ownerView) return song.ownerId === ownerId;
      return song.isPublic === true;
    })
    .sort((a, b) => createdAtMillis(b.createdAt) - createdAtMillis(a.createdAt));
}

/** Tag only on an owner surface, and only for a song marked private. */
export function songShowsPrivateTag(
  song: { isPublic?: unknown },
  ownerCatalog: boolean
): boolean {
  return ownerCatalog && song.isPublic === false;
}

/**
 * Hero face stays on a public cover so a private poster never ships to fans.
 * The owner may fall back to their own private cover when nothing public exists.
 */
export function artistPageFaceSong<T extends { isPublic?: unknown }>(
  songs: readonly T[],
  ownerView: boolean
): T | null {
  const publicSong = songs.find(song => song.isPublic === true) ?? null;
  if (publicSong) return publicSong;
  return ownerView ? songs[0] ?? null : null;
}

/** One refresh after the viewer cookie lands. Never for fans or signed-out visitors. */
export function shouldRefreshOwnerCatalog(
  included: boolean,
  viewerUid: string | null | undefined,
  ownerId: string
): boolean {
  return !included && isArtistOwner(viewerUid, ownerId);
}
