/**
 * POST /api/users/link-wallet
 *
 * Links a Solana wallet address to the authenticated Firebase user.
 * Requires: Authorization: Bearer <Firebase ID Token>
 * Body: { publicKey: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { verifyIdToken } from '@/lib/firebase/admin';
import { adminUpdateUserSolanaWallet } from '@/lib/server/usersAdmin';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUser(request);
    const authHeader = request.headers.get('authorization') || '';
    const decodedToken = await verifyIdToken(authHeader.slice('Bearer '.length).trim());
    const body = await request.json();
    const publicKey = body.publicKey;

    if (!publicKey || typeof publicKey !== 'string') {
      return NextResponse.json(
        { error: 'publicKey is required and must be a string' },
        { status: 400 }
      );
    }

    const trimmed = publicKey.trim();
    if (trimmed.length < 32 || trimmed.length > 44) {
      return NextResponse.json(
        { error: 'Invalid publicKey format' },
        { status: 400 }
      );
    }

    await adminUpdateUserSolanaWallet(userId, trimmed, decodedToken.email);

    return NextResponse.json({ success: true, solanaWalletAddress: trimmed });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[API /users/link-wallet] Error:', error);
    return NextResponse.json(
      { error: 'Failed to link wallet' },
      { status: 500 }
    );
  }
}
