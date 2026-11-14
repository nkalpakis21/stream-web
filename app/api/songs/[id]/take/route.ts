import { NextRequest } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { platformFromRequest } from '@/lib/funnel/platform';
import { noStoreJson } from '@/lib/http/noStore';
import { readTakeSwitchBody, songTakeAuthVerifier, switchSongTake } from '@/lib/server/songTake';
import { SWITCH_TAKE_ERROR } from '@/lib/songs/takes';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/**
 * POST /api/songs/[id]/take
 * Owner-only. Admin SDK sets currentVersionId, updatedAt, and isPrimary.
 * Client song updates stay on the existing rules allowlist
 * (title, isPublic, updatedAt, deletedAt, currentVersionId, artistVersionId).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ownerId = await requireUser(request, {
      verifyToken: songTakeAuthVerifier(),
    });
    const body = await request.json().catch(() => null);
    const parsed = readTakeSwitchBody(body);
    const result = await switchSongTake({
      songId: params.id,
      ownerId,
      versionId: parsed.versionId,
      msToPick: parsed.msToPick,
      platform: platformFromRequest(request),
    });
    return noStoreJson({ ok: true, take: result.take, unchanged: result.unchanged });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[API /songs/[id]/take]', error instanceof Error ? error.message : 'failed');
    return noStoreJson({ error: SWITCH_TAKE_ERROR }, 500);
  }
}
