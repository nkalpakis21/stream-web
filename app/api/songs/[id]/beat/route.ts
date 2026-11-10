import { NextRequest } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { platformFromRequest } from '@/lib/funnel/platform';
import { noStoreJson } from '@/lib/http/noStore';
import { parseRetryRequest, retryBeat } from '@/lib/server/beatFirst';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/** Regenerate the beat. The server refuses a third retry. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const uid = await requireUser(request);
    const body = await request.json().catch(() => null);
    const parsed = parseRetryRequest(body);
    const result = await retryBeat({
      songId: params.id,
      uid,
      feel: parsed.feel,
      energy: parsed.energy,
      platform: platformFromRequest(request),
    });
    return noStoreJson({ ok: true, ...result });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[API /songs/[id]/beat]', error instanceof Error ? error.message : 'failed');
    return noStoreJson({ error: "Couldn't make a beat." }, 500);
  }
}
