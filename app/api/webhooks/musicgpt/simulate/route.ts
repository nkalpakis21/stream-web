import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import {
  processMusicGptWebhook,
  songOwnerForMusicGptTask,
  type MusicGPTWebhookPayload,
} from '@/lib/server/musicgptWebhook';
import { musicGptWebhookSecret } from '@/lib/webhooks/musicgptAuth';
import { redactForLog } from '@/lib/webhooks/redactUrl';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Same uid the song-page developer panel uses for production testing. */
const WEBHOOK_SIMULATE_ADMIN_UID = 'MuXWPDQ9iDeFOv5N6mCzCJA1QCH2';

/**
 * Signed-in stand-in for the MusicGPT callback. The public webhook requires
 * the shared secret, which the browser must not see. Only the song owner
 * (or the existing developer admin uid) can drive it.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUser(request);
    const body = (await request.json()) as MusicGPTWebhookPayload;
    if (!body?.task_id || typeof body.task_id !== 'string') {
      throw new HttpError(400, 'Invalid payload: missing required field (task_id)');
    }

    const ownerId = await songOwnerForMusicGptTask(body.task_id);
    if (
      ownerId &&
      ownerId !== userId &&
      userId !== WEBHOOK_SIMULATE_ADMIN_UID
    ) {
      throw new HttpError(403, 'Only the song owner can simulate this webhook');
    }

    return processMusicGptWebhook(body);
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error(
      '[MusicGPT Webhook Simulate] Error',
      redactForLog(error, musicGptWebhookSecret())
    );
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
