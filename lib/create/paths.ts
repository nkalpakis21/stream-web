export const CREATE_ARTIST_HREF = '/create?step=artist';
export const CREATE_SONG_HREF = '/create?step=song';
export const STUDIO_NEW_ARTIST_HREF = '/dashboard?tab=artists&new=1';
export const STUDIO_NEW_SONG_HREF = '/dashboard?tab=songs&new=1';

export function studioHrefFromCreateSearch(
  search: string | { get(name: string): string | null } | null | undefined
): string {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search;
  const step = params?.get('step');
  const artistId = params?.get('artistId');

  if (step === 'song') {
    const qs = new URLSearchParams({ tab: 'songs', new: '1' });
    if (artistId) qs.set('artistId', artistId);
    return `/dashboard?${qs.toString()}`;
  }

  return STUDIO_NEW_ARTIST_HREF;
}
