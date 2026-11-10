import { NextRequest } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { platformFromRequest } from '@/lib/funnel/platform';
import { noStoreJson } from '@/lib/http/noStore';
import { keepBeatInstrumental, parseKeepRequest } from '@/lib/server/beatFirst';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/** Save the chosen beat as the instrumental song. No vocal pass. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const uid = await requireUser(request);
    const body = await request.json().catch(() => null);
    const parsed = parseKeepRequest(body);
    const result = await keepBeatInstrumental({
      songId: params.id,
      uid,
      versionId: parsed.versionId,
      platform: platformFromRequest(request),
    });
    return noStoreJson({ ok: true, songId: result.songId });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[API /songs/[id]/beat/keep]', error instanceof Error ? error.message : 'failed');
    return noStoreJson({ error: "Couldn't save this beat." }, 500);
  }
}
