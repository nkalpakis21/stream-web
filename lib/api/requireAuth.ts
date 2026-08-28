import { NextRequest, NextResponse } from 'next/server';
import {
  isFirebaseAdminConfigured,
  isFirebaseAdminInitError,
  verifyIdToken,
} from '@/lib/firebase/admin';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

const ADMIN_UNAVAILABLE_MESSAGE = 'Temporarily unavailable';

export async function requireUserId(
  request: NextRequest,
  options?: { unavailableMessage?: string }
): Promise<string> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Authentication required. Provide Bearer token.');
  }

  const unavailableMessage = options?.unavailableMessage ?? ADMIN_UNAVAILABLE_MESSAGE;
  if (!isFirebaseAdminConfigured()) {
    console.error('[auth] Firebase Admin is not initialized');
    throw new HttpError(503, unavailableMessage);
  }

  try {
    const decoded = await verifyIdToken(authHeader.slice(7));
    return decoded.uid;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (isFirebaseAdminInitError(err)) {
      console.error('[auth] Firebase Admin is not initialized:', err);
      throw new HttpError(503, unavailableMessage);
    }
    console.error('[auth] Token verification failed:', err);
    throw new HttpError(401, 'Invalid or expired token');
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (isFirebaseAdminInitError(error)) {
    console.error('[auth] Firebase Admin is not initialized:', error);
    return NextResponse.json(
      { error: ADMIN_UNAVAILABLE_MESSAGE },
      { status: 503 }
    );
  }
  const message = error instanceof Error ? error.message : 'Internal error';
  console.error('[API]', error);
  return NextResponse.json({ error: message }, { status: 500 });
}
