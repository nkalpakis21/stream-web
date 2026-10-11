/**
 * POST /api/artists/pump-fun/create-tx
 *
 * Verifies the Firebase ID token, binds coinMints/{mint} to that uid,
 * then builds an unsigned pump.fun create_v2 VersionedTransaction.
 * The client generates the mint keypair and signs only after this returns.
 * No initial buy. Never accepts a private key or seed.
 * If the mint is already bound to another uid, or the binding is a
 * tombstone, respond 409 and send no transaction. If the bind write
 * fails, respond with an error and send no transaction.
 */

import { NextRequest } from 'next/server';
import { handlePumpFunCreateTx } from '@/lib/server/coinMints';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  return handlePumpFunCreateTx(request);
}
