import { NextRequest, NextResponse } from 'next/server';
import { isCoverJobAuthorized, isFalCoverPipeline } from '@/lib/covers/config';
import { generateSongCover } from '@/lib/covers/generate';

/**
 * POST /api/covers/generate
 * Internal Fal cover job. Does not block MusicGPT audio.
 *
 * Auth: x-cover-job-secret or Authorization Bearer
 *   (COVER_JOB_SECRET, else REVALIDATE_SECRET; Bearer CRON_SECRET also ok).
 * Env: COVER_PIPELINE=fal, FAL_KEY.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!isCoverJobAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isFalCoverPipeline()) {
    return NextResponse.json(
      { ok: true, skipped: true, reason: 'COVER_PIPELINE is not fal' },
      { status: 200 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { songId?: string };
    const songId = body.songId?.trim();
    if (!songId) {
      return NextResponse.json({ error: 'songId is required' }, { status: 400 });
    }

    const result = await generateSongCover(songId);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cover job failed';
    console.error('[API /covers/generate]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
