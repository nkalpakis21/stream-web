import { NextRequest } from 'next/server';
import { canonicalVisitorId, VISITOR_COOKIE } from '@/lib/analytics/visitorId';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { noStoreJson } from '@/lib/http/noStore';
import { loadArtistOwnerStats } from '@/lib/server/artistOwnerStats';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

type TokenVerifier = (idToken: string) => Promise<{ uid: string }>;

let verifyForTests: TokenVerifier | null = null;

/** Test-only. Production requests always verify the Firebase ID token. */
export function setArtistStatsAuthForTests(verify: TokenVerifier | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setArtistStatsAuthForTests is disabled in production');
  }
  verifyForTests = verify;
}

/**
 * GET /api/artists/[id]/stats
 * Owner-only counts for the last 7 days.
 * Requires Authorization: Bearer. The ss_viewer cookie is ignored.
 * ss_visitor, when present, is the owner's anon id and is excluded from
 * plays, listeners, and shares.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const uid = await requireUser(request, {
      verifyToken: verifyForTests ?? undefined,
    });
    const ownerAnonId = canonicalVisitorId(request.cookies.get(VISITOR_COOKIE)?.value);
    const stats = await loadArtistOwnerStats({
      artistId: params.id ?? '',
      uid,
      ownerAnonId,
    });
    return noStoreJson(stats);
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error(
      '[API /artists/[id]/stats]',
      error instanceof Error ? error.message : 'failed'
    );
    return noStoreJson({ error: 'Failed to load artist stats' }, 500);
  }
}
