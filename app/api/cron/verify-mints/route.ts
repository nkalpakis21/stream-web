/**
 * GET /api/cron/verify-mints
 *
 * Vercel cron, every 5 minutes. Authorization: Bearer CRON_SECRET.
 * Skips artists stamped with mintSweepExemptAt. For every other artist
 * with pumpFun.mint and no verifiedAt, the first run writes mintFirstSeenAt
 * and stops. A missing coinMints binding is cleared only after that stamp
 * is more than 30 minutes old. createdAt is not used.
 *
 * This deploy does not include vercel.json, so the schedule is not
 * registered and this route cannot run on a timer before mark-legacy-mints.
 * Deploy order: merge, promote, run scripts/mark-legacy-mints.ts once the
 * promote is green, print the dry-run mismatches, then add the cron.
 * The script does not overwrite an existing mintSweepExemptAt.
 *
 * CRON_SECRET     Required. Unset rejects every request.
 * SOLANA_RPC_URL  Bonding-curve reads. Falls back to NEXT_PUBLIC_SOLANA_RPC_URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isMintSweepAuthorized, runMintSweep } from '@/lib/server/mintSweep';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isMintSweepAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runMintSweep();
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[verify-mints] sweep failed', err);
    return NextResponse.json({ ok: false, error: 'Sweep failed' }, { status: 500 });
  }
}
