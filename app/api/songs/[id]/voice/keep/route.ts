import { NextRequest } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { platformFromRequest } from '@/lib/funnel/platform';
import { noStoreJson } from '@/lib/http/noStore';
import { CHANGE_VOICE_ERROR } from '@/lib/songs/voiceChange';
import {
  keepVoiceChange,
  parseVoiceKeepRequest,
  voiceChangeAuthVerifier,
} from '@/lib/server/voiceChange';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/** Keep a new voice as the main audio, or leave the original version in place. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const uid = await requireUser(request, { verifyToken: voiceChangeAuthVerifier() });
    const body = await request.json().catch(() => null);
    const parsed = parseVoiceKeepRequest(body);
    const result = await keepVoiceChange({
      songId: params.id,
      uid,
      versionId: parsed.versionId,
      platform: platformFromRequest(request),
    });
    return noStoreJson({ ok: true, songId: result.songId, kept: result.kept });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[API /songs/[id]/voice/keep]', error instanceof Error ? error.message : 'failed');
    return noStoreJson({ error: CHANGE_VOICE_ERROR }, 500);
  }
}
