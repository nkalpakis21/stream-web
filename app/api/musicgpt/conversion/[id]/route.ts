import { NextRequest, NextResponse } from 'next/server';
import { getConversionDataByConversionID } from '@/lib/ai/providers/musicgpt';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { isAdminUid } from '@/lib/server/adminUids';
import { musicGptConversionRouteDeps } from '@/lib/server/musicgptConversionRouteDeps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

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
    userId = await requireUser(request, { verifyToken: musicGptConversionRouteDeps().verifyToken });
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

    const result = await (musicGptConversionRouteDeps().getConversion ?? getConversionDataByConversionID)(
      conversionId
    );

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
