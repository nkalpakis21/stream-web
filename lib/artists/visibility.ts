/**
 * Who may see an artist page, its metadata, or a full artist API payload.
 * Public artists are visible. Everyone else needs the verified owner.
 * Song-card display (name + https face, linkable false) is a separate path.
 */
export interface ArtistVisibilityInput {
  isPublic?: unknown;
  deletedAt?: unknown;
  ownerId?: unknown;
  name?: unknown;
  lore?: unknown;
  avatarURL?: unknown;
}

export function artistIsVisible<T extends ArtistVisibilityInput>(
  artist: T | null | undefined,
  viewerId: string | null | undefined
): artist is T {
  if (!artist || artist.deletedAt) return false;
  if (artist.isPublic === true) return true;
  return typeof viewerId === 'string' && viewerId.length > 0 && artist.ownerId === viewerId;
}

export interface ArtistShareMetadata {
  title: string;
  description?: string;
  image: string | null;
  canonical?: string;
}

/**
 * Share tags stay generic unless the artist is public.
 * A private page the owner can open still must not put name, bio, or face in og tags.
 */
export function artistShareMetadata(
  artist: ArtistVisibilityInput | null | undefined,
  pageUrl: string
): ArtistShareMetadata {
  if (!artist || artist.deletedAt || artist.isPublic !== true) {
    return { title: 'Artist', image: null };
  }
  const name = typeof artist?.name === 'string' ? artist.name.trim() : '';
  if (!name) return { title: 'Artist', image: null };
  const image =
    typeof artist?.avatarURL === 'string' && artist.avatarURL.trim()
      ? artist.avatarURL.trim()
      : null;
  return {
    title: name,
    description: `Listen to ${name} on Streamstar`,
    image,
    canonical: pageUrl,
  };
}

/** 404-page metadata. No name, bio, or face, including for the owner. */
export function hiddenArtistPageMetadata() {
  const description = "This artist isn't on Streamstar.";
  return {
    title: 'Artist',
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title: 'Artist',
      description,
      images: [] as string[],
    },
    twitter: {
      card: 'summary' as const,
      title: 'Artist',
      description,
      images: [] as string[],
    },
  };
}

export function artistReadResponse(
  artist: ArtistVisibilityInput | null | undefined,
  viewerId: string | null | undefined
): { status: 404; body: { error: string } } | { status: 200; artist: ArtistVisibilityInput } {
  if (!artist || !artistIsVisible(artist, viewerId)) {
    return { status: 404, body: { error: 'Artist not found' } };
  }
  return { status: 200, artist };
}
