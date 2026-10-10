/**
 * POST /api/artists/[id]/pump-fun
 *
 * Persist a confirmed artist coin, then verify the mint's bonding-curve
 * creator against the owner's linked wallet. See confirmArtistPumpFun.
 */

import { NextRequest } from 'next/server';
import { handlePumpFunConfirm } from '@/lib/server/confirmArtistPumpFun';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return handlePumpFunConfirm(request, params.id);
}
