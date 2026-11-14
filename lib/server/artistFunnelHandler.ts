import { NextRequest } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { platformFromRequest } from '@/lib/funnel/platform';
import { noStoreJson } from '@/lib/http/noStore';
import { adminGetArtist } from '@/lib/server/artistsAdmin';
import {
  artistFunnelPlan,
  artistHasFace,
  recordFunnelEvent,
  timestampMillis,
} from '@/lib/server/funnel';
import { isVoiceSlug } from '@/lib/voices/streamstarVoices';

type ArtistSnap = {
  ownerId?: unknown;
  deletedAt?: unknown;
  createdAt?: unknown;
  avatarURL?: unknown;
  voiceSlug?: unknown;
};

type TokenVerifier = (idToken: string) => Promise<{ uid: string }>;

let verifyForTests: TokenVerifier | null = null;
let readArtistForTests: ((artistId: string) => Promise<ArtistSnap | null>) | null = null;

export function setArtistFunnelTestHooks(
  hooks: {
    verifyToken?: TokenVerifier | null;
    readArtist?: ((artistId: string) => Promise<ArtistSnap | null>) | null;
  } | null
): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setArtistFunnelTestHooks is disabled in production');
  }
  verifyForTests = hooks?.verifyToken ?? null;
  readArtistForTests = hooks?.readArtist ?? null;
}

/**
 * POST /api/artists/[id]/funnel
 *
 * The browser creates the artist and locks a look with the client SDK.
 * This route re-reads that document with the Admin SDK and records
 * artist_created and face_set only when the signed-in user owns it.
 * The body is ignored. The client cannot choose the event name.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const uid = await requireUser(request, {
      verifyToken: verifyForTests ?? undefined,
    });
    const artistId = params.id?.trim() ?? '';
    if (!artistId || artistId.length > 128 || /[/\s]/.test(artistId)) {
      return noStoreJson({ error: 'Artist not found' }, 404);
    }

    const artist = readArtistForTests
      ? await readArtistForTests(artistId)
      : await adminGetArtist(artistId);
    if (!artist || typeof artist.ownerId !== 'string' || artist.ownerId !== uid || artist.deletedAt) {
      return noStoreJson({ error: 'Artist not found' }, 404);
    }

    const plan = artistFunnelPlan({
      uid,
      ownerId: artist.ownerId,
      deleted: false,
      createdAtMs: timestampMillis(artist.createdAt),
      hasFace: artistHasFace(artist.avatarURL),
      nowMs: Date.now(),
    });

    const platform = platformFromRequest(request);
    try {
      if (plan.artistCreated) {
        recordFunnelEvent(uid, 'artist_created', { artistId }, platform);
      }
      if (plan.faceSet) {
        recordFunnelEvent(uid, 'face_set', { artistId }, platform);
      }
      if (plan.artistCreated && isVoiceSlug(artist.voiceSlug)) {
        recordFunnelEvent(uid, 'voice_picked', { artistId, voice: artist.voiceSlug }, platform);
      }
    } catch (error) {
      console.error(
        '[funnel] artist',
        error instanceof Error ? error.message : 'failed'
      );
    }
    return noStoreJson({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[funnel] artist', error instanceof Error ? error.message : 'failed');
    return noStoreJson({ ok: true });
  }
}
