/**
 * Display-safe artist fields for song cards.
 * Private artist documents stay private. Callers get name, photo, id,
 * and whether the artist page can be linked.
 */
export interface ArtistCardDisplay {
  id: string;
  name: string;
  photoUrl: string | null;
  /** True only when the artist page is public. Private artists render as text. */
  isPublic: boolean;
}

/** One denied or missing artist drops only that id. Every song stays in the list. */
export function songCardsFromArtistLookups<T extends { id: string; artistId: string }>(
  songs: readonly T[],
  lookups: readonly PromiseSettledResult<ArtistCardDisplay | null>[]
): Array<T & { artist: ArtistCardDisplay | null }> {
  const byId = new Map<string, ArtistCardDisplay>();
  for (const result of lookups) {
    if (result.status === 'fulfilled' && result.value) {
      byId.set(result.value.id, result.value);
    }
  }
  return songs.map(song => ({
    ...song,
    artist: byId.get(song.artistId) ?? null,
  }));
}

/** https display URL only. Storage paths and other schemes stay off the card. */
export function httpsDisplayUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Locked look first (current artist version `avatarURL`), then the artist
 * document `avatarURL`. Both must already be public https URLs.
 */
export function publicArtistPhotoUrl(lockedLookUrl: unknown, avatarURL: unknown): string | null {
  return httpsDisplayUrl(lockedLookUrl) ?? httpsDisplayUrl(avatarURL);
}

export function isPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'permission-denied' || code === 'firestore/permission-denied') return true;
  const message = error instanceof Error ? error.message : String(error);
  return /permission-denied|insufficient permissions/i.test(message);
}
