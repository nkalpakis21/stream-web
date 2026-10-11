import { NextRequest, NextResponse } from 'next/server';
import { getArtistCardContext } from '@/lib/server/artistDisplay';

export const runtime = 'nodejs';

const MAX_IDS = 100;

/**
 * POST /api/artists/display
 *
 * Display-safe artist fields for song cards: id, name, photoUrl, isPublic.
 * Admin read. Does not return the artist document.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const artistIds = body?.artistIds;
    if (!Array.isArray(artistIds) || artistIds.length === 0) {
      return NextResponse.json({ error: 'artistIds array is required' }, { status: 400 });
    }
    if (artistIds.length > MAX_IDS) {
      return NextResponse.json({ error: `At most ${MAX_IDS} artist ids` }, { status: 400 });
    }
    if (!artistIds.every(id => typeof id === 'string' && id.trim())) {
      return NextResponse.json({ error: 'artistIds must be non-empty strings' }, { status: 400 });
    }

    const { displays } = await getArtistCardContext(artistIds as string[]);
    return NextResponse.json({
      artists: [...displays.values()],
    });
  } catch (error) {
    console.error('[API /artists/display] Error:', error);
    return NextResponse.json({ error: 'Failed to load artist names' }, { status: 500 });
  }
}
