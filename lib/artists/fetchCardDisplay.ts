import type { ArtistCardDisplay } from '@/lib/artists/cardDisplay';

const CHUNK = 100;

function asDisplay(value: unknown): ArtistCardDisplay | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null;
  const name = record.name.trim();
  if (!name) return null;
  const photo = typeof record.photoUrl === 'string' ? record.photoUrl.trim() : '';
  return {
    id: record.id,
    name,
    photoUrl: photo || null,
    isPublic: record.isPublic === true,
  };
}

/**
 * Song-card artist names and photos. One failed chunk does not reject the rest.
 */
export async function fetchArtistCardDisplays(
  artistIds: readonly string[]
): Promise<Map<string, ArtistCardDisplay>> {
  const unique = [...new Set(artistIds.map(id => id.trim()).filter(Boolean))];
  const displays = new Map<string, ArtistCardDisplay>();
  if (unique.length === 0) return displays;

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    try {
      const response = await fetch('/api/artists/display', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistIds: chunk }),
      });
      if (!response.ok) continue;
      const body = (await response.json()) as { artists?: unknown };
      const artists = Array.isArray(body.artists) ? body.artists : [];
      for (const artist of artists) {
        const display = asDisplay(artist);
        if (display) displays.set(display.id, display);
      }
    } catch (error) {
      console.warn('[fetchArtistCardDisplays] skipped chunk', error);
    }
  }

  return displays;
}
