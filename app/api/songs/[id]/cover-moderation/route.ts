import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { canModerateSongCover } from '@/lib/covers/moderation';
import { generateSongCover } from '@/lib/covers/generate';
import {
  prepareCoverReplacement,
  retryCoverModeration,
  screenSongCover,
  type CoverModerationRun,
} from '@/lib/server/coverModeration';
import { isAdminUid } from '@/lib/server/adminUids';
import { adminGetSong } from '@/lib/server/songsAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';
export const maxDuration = 300;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

/**
 * Owner or admin. `retry` re-checks songs stuck on error or pending.
 * `replace` clears the cover and runs the Fal cover job when that pipeline is on.
 * Vision failures stay on the song as status `error` and respond 200.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const songId = params.id?.trim();
    if (!songId) return json({ error: 'Song not found' }, 404);

    const userId = await requireUser(request);
    const song = await adminGetSong(songId);
    if (!song || song.deletedAt) return json({ error: 'Song not found' }, 404);
    if (!canModerateSongCover(userId, song.ownerId, isAdminUid(userId))) {
      return json({ error: 'Only the owner can update this cover' }, 403);
    }

    const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
    const action = body?.action;
    if (action !== 'retry' && action !== 'replace') {
      return json({ error: 'action must be retry or replace' }, 400);
    }

    const result =
      action === 'retry' ? await retryCoverModeration(songId) : await replaceSongCover(songId);
    if (result.reason === 'not_found') return json({ error: 'Song not found' }, 404);
    return json({
      ok: result.ok,
      status: result.status ?? null,
      skipped: result.skipped === true,
      reason: result.reason ?? null,
    });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[API /songs/cover-moderation]', error instanceof Error ? error.message : 'error');
    return json({ error: 'Cover check failed' }, 500);
  }
}

function storedStatus(song: { coverModeration?: { status?: unknown } | null } | null): CoverModerationRun['status'] {
  const status = song?.coverModeration?.status;
  if (status === 'pending' || status === 'passed' || status === 'flagged' || status === 'error') {
    return status;
  }
  return undefined;
}

async function replaceSongCover(songId: string): Promise<CoverModerationRun> {
  const prepared = await prepareCoverReplacement(songId);
  if (!prepared.ok || prepared.skipped) return prepared;
  try {
    const job = await generateSongCover(songId);
    const current = storedStatus(await adminGetSong(songId));
    if (current === 'passed' || current === 'flagged') {
      return { ok: true, status: current };
    }
    if (!job.ok || job.reason === 'cover_not_public') {
      if (current === 'error') return { ok: false, status: 'error', reason: job.reason };
      const failed = await screenSongCover(songId);
      return failed.status ? failed : { ok: false, status: 'error', reason: job.reason || 'replace_failed' };
    }
    return { ok: true, status: current ?? 'pending' };
  } catch (error) {
    console.error(
      '[cover-moderation] replace failed',
      songId,
      error instanceof Error ? error.message : 'error'
    );
    const failed = await screenSongCover(songId);
    return failed.status ? failed : { ok: false, status: 'error', reason: 'replace_failed' };
  }
}
