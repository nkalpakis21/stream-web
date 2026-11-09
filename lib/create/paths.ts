export const CREATE_ARTIST_HREF = '/create';

/** Generic Create (header and tab). Managers who already have an artist pick song or artist. */
export function createEntryTarget(input: {
  signedIn: boolean;
  hasArtists: boolean;
}): 'sheet' | 'create' {
  if (input.signedIn && input.hasArtists) return 'sheet';
  return 'create';
}
/** Additional songs for an artist who already exists. Not the artist create flow. */
export const CREATE_SONG_HREF = '/dashboard?tab=songs&new=1';
/** Old studio "new artist" URL. Bookmarks redirect to `/create`. */
export const STUDIO_NEW_ARTIST_HREF = '/dashboard?tab=artists&new=1';
export const STUDIO_NEW_SONG_HREF = '/dashboard?tab=songs&new=1';

type SearchLike = {
  get(name: string): string | null;
  forEach?(callback: (value: string, key: string) => void): void;
  toString(): string;
};

function asParams(search: string | SearchLike | null | undefined): URLSearchParams {
  if (!search) return new URLSearchParams();
  if (typeof search === 'string') {
    return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  }
  return new URLSearchParams(search.toString());
}

/**
 * `/dashboard?tab=artists&new=1` is the retired artist form.
 * Drop those two keys and keep anything else on `/create`.
 * Returns null when this is not that old URL.
 */
export function legacyArtistCreateHref(search: string | SearchLike | null | undefined): string | null {
  const params = asParams(search);
  if (params.get('tab') !== 'artists' || params.get('new') !== '1') return null;
  params.delete('tab');
  params.delete('new');
  const qs = params.toString();
  return qs ? `/create?${qs}` : '/create';
}

/**
 * Old `/create?step=` links. Artist steps stay on `/create`.
 * A song step still opens the studio song form and keeps `artistId`.
 */
export function studioHrefFromCreateSearch(
  search: string | SearchLike | null | undefined
): string {
  const params = asParams(search);
  const step = params.get('step');
  const artistId = params.get('artistId');

  if (step === 'song') {
    const qs = new URLSearchParams({ tab: 'songs', new: '1' });
    if (artistId) qs.set('artistId', artistId);
    return `/dashboard?${qs.toString()}`;
  }

  params.delete('step');
  const qs = params.toString();
  return qs ? `/create?${qs}` : '/create';
}
