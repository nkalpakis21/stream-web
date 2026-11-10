import { NextRequest } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { platformFromRequest } from '@/lib/funnel/platform';
import { noStoreJson } from '@/lib/http/noStore';
import { addBeatVocals, parseVocalsRequest } from '@/lib/server/beatFirst';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/** Sing Over the chosen beat. Two takes land in the existing pick-your-take picker. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const uid = await requireUser(request);
    const body = await request.json().catch(() => null);
    const parsed = parseVocalsRequest(body);
    const result = await addBeatVocals({
      songId: params.id,
      uid,
      ...parsed,
      platform: platformFromRequest(request),
    });
    return noStoreJson({ ok: true, songId: result.songId });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[API /songs/[id]/beat/vocals]', error instanceof Error ? error.message : 'failed');
    return noStoreJson({ error: "Couldn't add vocals." }, 500);
  }
}
