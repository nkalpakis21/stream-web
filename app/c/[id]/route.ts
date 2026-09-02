/**
 * GET /c/{id}
 *
 * Public pump.fun coin metadata JSON. pump.fun HTTP GETs this URI during
 * create_v2. No auth. JSON lives in Firebase Storage at c/{id}.json;
 * this route is the short URL we control (max 200 chars).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getAdminBucket,
  isFirebaseAdminConfigured,
  isFirebaseAdminInitError,
} from '@/lib/firebase/admin';
import {
  isValidPumpFunMetadataId,
  pumpFunMetadataObjectPath,
} from '@/lib/solana/pumpFun';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
  'Access-Control-Allow-Origin': '*',
};

function notFound(): NextResponse {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id?.trim() ?? '';
  if (!isValidPumpFunMetadataId(id)) {
    return notFound();
  }

  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
  }

  try {
    const bucket = getAdminBucket();
    const file = bucket.file(pumpFunMetadataObjectPath(id));
    const [exists] = await file.exists();
    if (!exists) {
      return notFound();
    }

    const [buf] = await file.download();
    const parsed: unknown = JSON.parse(buf.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Invalid metadata' }, { status: 500 });
    }

    return NextResponse.json(parsed, { headers: CACHE_HEADERS });
  } catch (error) {
    if (isFirebaseAdminInitError(error)) {
      return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    }
    console.error('[pump.fun metadata] GET /c failed', error);
    return notFound();
  }
}
