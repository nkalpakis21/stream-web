import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { isAdminUid } from '@/lib/server/adminUids';
import {
  processMusicGptWebhook,
  songOwnerForMusicGptTask,
  type MusicGPTWebhookPayload,
} from '@/lib/server/musicgptWebhook';
import { musicGptWebhookSecret } from '@/lib/webhooks/musicgptAuth';
import { redactForLog } from '@/lib/webhooks/redactUrl';

export const runtime = 'nodejs';
export const maxDuration = 300;

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

/**
 * Dev-only stand-in for the MusicGPT callback. Hidden in production so the
 * path does not advertise itself. Outside production the caller must be a
 * verified user whose uid is in `ADMIN_UIDS`, and the task must already have
 * a song owner. Those misses are also 404.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    return notFound();
  }

  let userId: string;
  try {
    userId = await requireUser(request);
  } catch (error) {
    if (error instanceof HttpError) return notFound();
    console.error(
      '[MusicGPT Webhook Simulate] Error',
      redactForLog(error, musicGptWebhookSecret())
    );
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  if (!isAdminUid(userId)) return notFound();

  try {
    const body = (await request.json()) as MusicGPTWebhookPayload;
    if (!body?.task_id || typeof body.task_id !== 'string') {
      throw new HttpError(400, 'Invalid payload: missing required field (task_id)');
    }

    const ownerId = await songOwnerForMusicGptTask(body.task_id);
    if (!ownerId) return notFound();

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
