import { NextRequest } from 'next/server';
import { errorResponse, HttpError, requireUserId } from '@/lib/api/requireAuth';
import { noStoreJson } from '@/lib/http/noStore';
import { adminGetArtist, adminSetArtistVoice } from '@/lib/server/artistsAdmin';
import { isVoiceSlug } from '@/lib/voices/streamstarVoices';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/**
 * POST /api/artists/[id]/voice
 * Owner only. Body is `{ voice: slug }`. Does not change existing songs.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId(request);
    const artistId = params.id?.trim() ?? '';
    if (!artistId || artistId.length > 128 || /[/\s]/.test(artistId)) {
      throw new HttpError(404, 'Artist not found');
    }
    const artist = await adminGetArtist(artistId);
    if (!artist || artist.deletedAt) throw new HttpError(404, 'Artist not found');
    if (artist.ownerId !== userId) throw new HttpError(403, 'Only the owner can change this voice');

    const body = (await request.json().catch(() => null)) as { voice?: unknown } | null;
    if (!isVoiceSlug(body?.voice)) throw new HttpError(400, 'Pick a voice first');
    await adminSetArtistVoice(artistId, userId, body.voice);
    return noStoreJson({ ok: true, voice: body.voice });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[artist voice]', error instanceof Error ? error.message : 'failed');
    return noStoreJson({ error: "Couldn't change the voice." }, 500);
  }
}
