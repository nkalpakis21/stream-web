import { NextResponse } from 'next/server';
import { isXConfigured, X_CLIENT_ID_MISSING_MESSAGE } from '@/lib/x/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/x/status
 * Ungated: reports whether Connect X is configured (X_CLIENT_ID + X_CLIENT_SECRET).
 */
export async function GET() {
  const available = isXConfigured();
  return NextResponse.json({
    available,
    message: available ? null : X_CLIENT_ID_MISSING_MESSAGE,
  });
}
