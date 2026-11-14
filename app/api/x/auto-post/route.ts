import { NextRequest } from 'next/server';
import { errorResponse, HttpError, requireUserId } from '@/lib/api/requireAuth';
import { noStoreJson } from '@/lib/http/noStore';
import { artistIsVisible } from '@/lib/artists/visibility';
import { getArtist } from '@/lib/services/artists';
import { isXConfigured } from '@/lib/x/config';
import { autoPostSwitchPatch, timestampMillis } from '@/lib/x/autoPost';
import { firestoreNow, getArtistAdmin, publicXConnection, updateArtistX } from '@/lib/x/artistStore';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/**
 * POST /api/x/auto-post
 * Body: { artistId: string, enabled: boolean }
 * Owner-only. Saves immediately. Turning on stores autoPostEnabledAt and
 * does not backfill songs that were already ready.
 * Requires Authorization: Bearer. The ss_viewer cookie is ignored.
 * 400 when X is not connected.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    if (!isXConfigured()) {
      return noStoreJson({ available: false }, 503);
    }
    const body = (await request.json().catch(() => ({}))) as {
      artistId?: string;
      enabled?: boolean;
    };
    const artistId = body.artistId?.trim();
    if (!artistId || typeof body.enabled !== 'boolean') {
      throw new HttpError(400, 'artistId and enabled are required');
    }

    let artist;
    try {
      artist = await getArtistAdmin(artistId);
    } catch {
      artist = await getArtist(artistId);
    }
    if (!artistIsVisible(artist, userId)) {
      throw new HttpError(404, 'Artist not found');
    }
    if (artist.ownerId !== userId) {
      throw new HttpError(403, 'Only the manager of this artist can change auto-post');
    }

    const x = publicXConnection(artist);
    if (x.status !== 'connected' || !x.username) {
      throw new HttpError(400, 'Connect X before changing auto-post');
    }

    const now = firestoreNow();
    const nowMs = timestampMillis(now) ?? Date.now();
    const patch = autoPostSwitchPatch(body.enabled, nowMs);
    if (patch.autoPost) {
      await updateArtistX(artistId, {
        autoPost: true,
        autoPostEnabledAt: now,
      });
    } else {
      await updateArtistX(artistId, { autoPost: false });
    }

    return noStoreJson({
      ok: true,
      autoPost: patch.autoPost,
      autoPostEnabledAt: patch.autoPost ? (patch.autoPostEnabledAtMs ?? nowMs) : timestampMillis(x.autoPostEnabledAt),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
