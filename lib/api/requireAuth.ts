import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase/admin';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function requireUserId(request: NextRequest): Promise<string> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Authentication required. Provide Bearer token.');
  }
  try {
    const decoded = await verifyIdToken(authHeader.slice(7));
    return decoded.uid;
  } catch (err) {
    console.error('[auth] Token verification failed:', err);
    throw new HttpError(401, 'Invalid or expired token');
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'Internal error';
  console.error('[API]', error);
  return NextResponse.json({ error: message }, { status: 500 });
}
