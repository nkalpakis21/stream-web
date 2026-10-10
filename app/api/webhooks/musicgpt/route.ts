import { NextResponse } from 'next/server';
import {
  musicGptWebhookSecret,
  musicGptWebhookTokenFromRequest,
  webhookTokensMatch,
} from '@/lib/webhooks/musicgptAuth';
import {
  processMusicGptWebhook,
  type MusicGPTWebhookPayload,
} from '@/lib/server/musicgptWebhook';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * MusicGPT does not sign webhook payloads.
 * https://docs.musicgpt.com/api-documentation/index/webhook
 *
 * The callback URL registered in POST /api/generations/musicgpt includes
 * `?token=<MUSICGPT_WEBHOOK_SECRET>`. Reject anything that does not present
 * that secret.
 */
export async function POST(request: Request) {
  console.log('[MusicGPT Webhook] Received request');

  try {
    const rawBody = await request.text();
    const secret = musicGptWebhookSecret();
    const provided = musicGptWebhookTokenFromRequest(request);

    if (!secret) {
      console.error('[MusicGPT Webhook] MUSICGPT_WEBHOOK_SECRET is not set');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    if (!webhookTokensMatch(provided, secret)) {
      console.error('[MusicGPT Webhook] Webhook token mismatch', {
        tokenPresent: Boolean(provided),
        bodyLength: rawBody.length,
      });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as MusicGPTWebhookPayload;
    console.log('[MusicGPT Webhook] Parsed Payload:', {
      task_id: body.task_id,
      conversion_id: body.conversion_id,
      subtype: body.subtype,
      conversion_type: body.conversion_type,
      hasConversionPath: !!body.conversion_path,
    });

    return processMusicGptWebhook(body);
  } catch (error) {
    console.error('[MusicGPT Webhook] Error', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
