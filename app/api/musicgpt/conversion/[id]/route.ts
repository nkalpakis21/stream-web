import { NextRequest, NextResponse } from 'next/server';
import { getConversionDataByConversionID } from '@/lib/ai/providers/musicgpt';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { isAdminUid } from '@/lib/server/adminUids';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type ConversionLookup = typeof getConversionDataByConversionID;

type ConversionRouteDeps = {
  verifyToken?: (idToken: string) => Promise<{ uid: string }>;
  getConversion?: ConversionLookup;
};

let depsForTests: ConversionRouteDeps | null = null;

/** Test-only. Production requests always use the real auth and MusicGPT clients. */
export function setMusicGptConversionRouteDepsForTests(deps: ConversionRouteDeps | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MusicGPT conversion route test hooks are disabled in production');
  }
  depsForTests = deps;
}

function routeDeps(): ConversionRouteDeps {
  if (process.env.NODE_ENV === 'production') return {};
  return depsForTests ?? {};
}

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

/**
 * Same gate as the webhook simulator: hidden when Node or Vercel is
 * production, and otherwise only a verified uid in ADMIN_UIDS.
 * Misses are 404 so the path does not advertise itself.
 */
function conversionLookupDisabled(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

/**
 * Fetch MusicGPT conversion details by conversion ID.
 * Used by the local webhook simulator. Not a public API.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (conversionLookupDisabled()) return notFound();

  let userId: string;
  try {
    userId = await requireUser(request, { verifyToken: routeDeps().verifyToken });
  } catch (error) {
    if (error instanceof HttpError) return notFound();
    console.error('[MusicGPT Conversion API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  if (!isAdminUid(userId)) return notFound();

  try {
    const conversionId = params.id;

    if (!conversionId) {
      return NextResponse.json({ error: 'Conversion ID is required' }, { status: 400 });
    }

    const result = await (routeDeps().getConversion ?? getConversionDataByConversionID)(conversionId);

    if (!result || !result.success) {
      return NextResponse.json({ error: 'Failed to fetch conversion details' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[MusicGPT Conversion API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
