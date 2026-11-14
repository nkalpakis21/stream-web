import { NextResponse } from 'next/server';
import { isXConfigured } from '@/lib/x/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/x/status
 * Ungated: reports whether Connect X is configured. Never returns key values or names.
 */
export async function GET() {
  return NextResponse.json({ available: isXConfigured() });
}
