import { NextRequest } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { platformFromRequest } from '@/lib/funnel/platform';
import { noStoreJson } from '@/lib/http/noStore';
import { parseBeatRequest, startBeatFirst } from '@/lib/server/beatFirst';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/** Start one beat-first song. The instrumental is the same v6 path as Just the beat. */
export async function POST(request: NextRequest) {
  try {
    const uid = await requireUser(request);
    const body = await request.json().catch(() => null);
    const parsed = parseBeatRequest(body);
    const result = await startBeatFirst({
      uid,
      ...parsed,
      platform: platformFromRequest(request),
    });
    return noStoreJson({ ok: true, songId: result.songId, reused: result.reused });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[API /songs/beat-first]', error instanceof Error ? error.message : 'failed');
    return noStoreJson({ error: "Couldn't make a beat." }, 500);
  }
}
