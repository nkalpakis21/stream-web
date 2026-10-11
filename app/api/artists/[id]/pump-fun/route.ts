/**
 * POST /api/artists/[id]/pump-fun
 *
 * Persist a confirmed artist coin, then verify it against the coinMints
 * binding. A pass means the coin went through our create-tx for this uid:
 * the binding uid is the artist owner and the bonding-curve creator matches
 * coinMints.creatorWallet. See confirmArtistPumpFun.
 */

import { NextRequest } from 'next/server';
import { handlePumpFunConfirm } from '@/lib/server/confirmArtistPumpFun';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return handlePumpFunConfirm(request, params.id);
}
