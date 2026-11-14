import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { adminAbandonOrphanSong, adminGetSong } from '@/lib/server/songsAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/**
 * POST /api/songs/[id]/abandon
 * Owner-only. Soft-deletes a song that never received audio, using the same
 * admin write as DELETE. A song that already has audio is left alone.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const songId = params.id?.trim();
    if (!songId) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }
    const userId = await requireUser(request);
    const body = await request.json().catch(() => null);
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const prompt = typeof record.prompt === 'string' ? record.prompt : undefined;
    const lyrics = typeof record.lyrics === 'string' ? record.lyrics : undefined;
    const song = await adminGetSong(songId);
    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }
    if (song.ownerId !== userId) {
      return NextResponse.json(
        { error: 'Only the owner can delete this song' },
        { status: 403 }
      );
    }
    const result = await adminAbandonOrphanSong(songId, { prompt, lyrics });
    if (result === 'has-audio') {
      return NextResponse.json({ error: 'Song already has audio' }, { status: 409 });
    }
    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[API /songs/abandon] Error:', error);
    return NextResponse.json({ error: 'Failed to abandon song' }, { status: 500 });
  }
}
