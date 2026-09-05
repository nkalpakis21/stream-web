/**
 * Artist index face sources.
 * Locked look first, then latest track cover (still the face slot),
 * then the card paints a filled initials disc. Fragile third-party
 * CDNs lose to a stored asset when both exist.
 */

function trimUrl(value: string | null | undefined): string | null {
  const url = value?.trim();
  return url ? url : null;
}

export function uniqueUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = trimUrl(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Firebase / Fal (or a same-origin path) — our stored look or cover. */
export function isStoredAsset(url: string): boolean {
  if (url.startsWith('/')) return true;
  const host = hostnameOf(url);
  if (!host) return false;
  return (
    host === 'firebasestorage.googleapis.com' ||
    host.endsWith('.firebasestorage.app') ||
    host === 'storage.googleapis.com' ||
    host === 'fal.media' ||
    host.endsWith('.fal.media')
  );
}

/** MusicGPT / lalals hosts that 404 into a blank disc. */
export function isFragileCdn(url: string): boolean {
  const host = hostnameOf(url);
  if (!host) return false;
  return host.includes('musicgpt.com') || host.includes('lalals.s3');
}

/** Stable: stored first, fragile CDNs last, otherwise keep input order. */
export function preferStored(urls: string[]): string[] {
  return urls
    .map((url, index) => ({ url, index }))
    .sort((a, b) => {
      const rank = (url: string) => {
        if (isStoredAsset(url)) return 0;
        if (isFragileCdn(url)) return 2;
        return 1;
      };
      return rank(a.url) - rank(b.url) || a.index - b.index;
    })
    .map(item => item.url);
}

export function songCoverCandidates(song?: {
  coverPosterUrl?: string | null;
  albumCoverPath?: string | null;
  albumCoverThumbnail?: string | null;
} | null): string[] {
  if (!song) return [];
  return preferStored(
    uniqueUrls([song.coverPosterUrl, song.albumCoverThumbnail, song.albumCoverPath])
  );
}

/**
 * Face src list in load order. `onerror` walks this; initials are last.
 * A stored look or cover is chosen over a MusicGPT / lalals URL when both exist.
 */
export function artistFaceSources(
  lookUrl: string | null | undefined,
  coverUrls: string[] = []
): string[] {
  const look = trimUrl(lookUrl);
  const covers = preferStored(uniqueUrls(coverUrls));
  if (!look) return covers;

  if (isFragileCdn(look)) {
    const stored = uniqueUrls([look, ...covers]).filter(isStoredAsset);
    if (stored.length > 0) {
      return uniqueUrls([...stored, look, ...covers]);
    }
  }

  return uniqueUrls([look, ...covers]);
}
