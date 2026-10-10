import { NextResponse } from 'next/server';
import {
  buildMusicGPTStyleFromArtistContext,
  createMusicGPTSong,
} from '@/lib/ai/providers/musicgpt';
import type { AIGenerationRequest } from '@/lib/ai/types';
import { musicGptWebhookUrl, musicGptWebhookUrlForLog } from '@/lib/webhooks/baseUrl';
import { musicGptWebhookSecret } from '@/lib/webhooks/musicgptAuth';
import { redactForLog, redactSecrets } from '@/lib/webhooks/redactUrl';

/**
 * Server-side API route for initiating MusicGPT generation.
 * This ensures API keys are never exposed to the client.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, lyrics, artistContext, num_outputs } = body as {
      prompt?: string;
      lyrics?: string;
      artistContext?: AIGenerationRequest['artistContext'];
      num_outputs?: 1 | 2;
    };

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // MusicGPT does not follow apex → www 307s. WEBHOOK_BASE_URL if set
    // (apex is rewritten to www); otherwise https://www.streamstar.xyz.
    const webhookUrl = musicGptWebhookUrl();
    if (!musicGptWebhookSecret()) {
      console.error(
        '[MusicGPT API Route] MUSICGPT_WEBHOOK_SECRET is not set; MusicGPT callbacks will be rejected'
      );
    }
    console.log('[MusicGPT API Route] Webhook URL being set:', musicGptWebhookUrlForLog());

    const style = buildMusicGPTStyleFromArtistContext(artistContext);
    const numOutputs: 1 | 2 = num_outputs === 2 ? 2 : 1;

    const response = await createMusicGPTSong({
      prompt,
      lyrics,
      ...style,
      num_outputs: numOutputs,
      webhook_url: webhookUrl,
    });

    // Extract task_id and conversion_ids from MusicGPT response
    const taskId =
      (response.task_id as string | undefined) ||
      (response.taskId as string | undefined) ||
      (response.job_id as string | undefined) ||
      (response.id as string | undefined) ||
      `musicgpt-${Date.now()}`;

    const conversionId1 = response.conversion_id_1 as string | undefined;
    const conversionId2 = response.conversion_id_2 as string | undefined;
    const conversionIds: string[] = [];
    if (conversionId1) conversionIds.push(conversionId1);
    if (conversionId2) conversionIds.push(conversionId2);

    return NextResponse.json({
      taskId,
      conversionIds,
      raw: redactForLog(response, musicGptWebhookSecret()),
    });
  } catch (error) {
    const secret = musicGptWebhookSecret();
    const errorMessage = redactSecrets(
      error instanceof Error ? error.message : 'MusicGPT request failed',
      secret
    );
    console.error('[MusicGPT API Route] Error:', redactForLog(error, secret));
    console.error('[MusicGPT API Route] Error details:', {
      message: errorMessage,
      stack:
        error instanceof Error && error.stack
          ? redactSecrets(error.stack, secret)
          : undefined,
    });
    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

