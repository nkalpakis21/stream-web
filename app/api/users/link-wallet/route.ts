/**
 * POST /api/users/link-wallet
 *
 * Links a Solana wallet address to the authenticated Firebase user.
 * Requires: Authorization: Bearer <Firebase ID Token>
 * Body: { publicKey: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase/admin';
import { updateUserSolanaWallet } from '@/lib/services/users';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required. Provide Bearer token.' },
        { status: 401 }
      );
    }

    const idToken = authHeader.slice(7);
    let decodedToken;
    try {
      decodedToken = await verifyIdToken(idToken);
    } catch (err) {
      console.error('[API /users/link-wallet] Token verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const userId = decodedToken.uid;
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

    await updateUserSolanaWallet(userId, trimmed, decodedToken.email);

    return NextResponse.json({ success: true, solanaWalletAddress: trimmed });
  } catch (error) {
    console.error('[API /users/link-wallet] Error:', error);
    return NextResponse.json(
      { error: 'Failed to link wallet' },
      { status: 500 }
    );
  }
}
