/**
 * POST /api/push/register
 * Body: { token, platform: "ios" }
 * Auth: Authorization: Bearer <Firebase ID token>
 *
 * Stores the token at users/{uid}/pushTokens/{sha256(token)}.
 * The same token from the same user updates that one document.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { noStoreJson } from '@/lib/http/noStore';
import { isExpoPushToken, pushTokenDocId, saveOwnerPushToken } from '@/lib/server/expoPush';

const bodySchema = z
  .object({
    token: z.string(),
    platform: z.literal('ios'),
  })
  .strict();

type TokenSaver = (uid: string, token: string) => Promise<void>;
type TokenVerifier = (idToken: string) => Promise<{ uid: string }>;

let verifyForTests: TokenVerifier | null = null;
let saveForTests: TokenSaver | null = null;

export function setPushRegisterForTests(
  hooks: { verifyToken?: TokenVerifier | null; save?: TokenSaver | null } | null
): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setPushRegisterForTests is disabled in production');
  }
  verifyForTests = hooks?.verifyToken ?? null;
  saveForTests = hooks?.save ?? null;
}

export function pushRegistrationId(token: string): string | null {
  if (!isExpoPushToken(token)) return null;
  return pushTokenDocId(token);
}

export async function POST(request: NextRequest) {
  try {
    const uid = await requireUser(request, {
      verifyToken: verifyForTests ?? undefined,
    });
    const raw = await request.text();
    if (raw.length > 4096) {
      return noStoreJson({ error: 'Invalid request' }, 400);
    }
    let json: unknown;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      return noStoreJson({ error: 'Invalid request' }, 400);
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success || !isExpoPushToken(parsed.data.token)) {
      return noStoreJson({ error: 'Invalid push token' }, 400);
    }
    const save = saveForTests ?? saveOwnerPushToken;
    await save(uid, parsed.data.token);
    return noStoreJson({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[push] register', error instanceof Error ? error.message : 'failed');
    return noStoreJson({ error: 'Could not save that token' }, 500);
  }
}
