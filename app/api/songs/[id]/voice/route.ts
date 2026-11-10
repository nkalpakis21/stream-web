import { NextRequest } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { platformFromRequest } from '@/lib/funnel/platform';
import { noStoreJson } from '@/lib/http/noStore';
import { CHANGE_VOICE_ERROR } from '@/lib/songs/voiceChange';
import {
  parseVoiceChangeRequest,
  startVoiceChange,
  voiceChangeAuthVerifier,
} from '@/lib/server/voiceChange';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/** Sing Over a beat. A finished mix is split first. Takes stay off the main audio until the owner keeps one. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const uid = await requireUser(request, { verifyToken: voiceChangeAuthVerifier() });
    const body = await request.json().catch(() => null);
    const parsed = parseVoiceChangeRequest(body);
    const result = await startVoiceChange({
      songId: params.id,
      uid,
      voice: parsed.voice,
      platform: platformFromRequest(request),
    });
    return noStoreJson({ ok: true, songId: result.songId, used: result.used });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[API /songs/[id]/voice]', error instanceof Error ? error.message : 'failed');
    return noStoreJson({ error: CHANGE_VOICE_ERROR }, 500);
  }
}
