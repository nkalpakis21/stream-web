import { NextRequest, NextResponse } from 'next/server';
import {
  buildMusicGPTStyleFromArtistContext,
  createMusicGPTSong,
} from '@/lib/ai/providers/musicgpt';
import type { AIGenerationRequest } from '@/lib/ai/types';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { adminGetArtist } from '@/lib/server/artistsAdmin';
import {
  musicGptGenerationCallback,
  musicGptWebhookUrlForLog,
} from '@/lib/webhooks/baseUrl';
import { musicGptWebhookSecret } from '@/lib/webhooks/musicgptAuth';
import { redactForLog, redactSecrets } from '@/lib/webhooks/redactUrl';

/**
 * Server-side API route for initiating MusicGPT generation.
 * This ensures API keys are never exposed to the client.
 */
export async function POST(request: NextRequest) {
  try {
    // Fail before auth or MusicGPT. A generation with no callback hangs, and
    // the request Host is not a safe base for a URL that carries the token.
    const callback = musicGptGenerationCallback();
    if (!callback.ok) {
      return NextResponse.json({ error: callback.error }, { status: callback.status });
    }

    const userId = await requireUser(request);
    const body = await request.json();
    const { prompt, lyrics, artistContext, artistId, num_outputs } = body as {
      prompt?: string;
      lyrics?: string;
      artistContext?: AIGenerationRequest['artistContext'];
      artistId?: string;
      num_outputs?: 1 | 2;
    };

    if (typeof artistId === 'string' && artistId.trim()) {
      const artist = await adminGetArtist(artistId.trim());
      if (!artist) {
        return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
      }
      if (artist.ownerId !== userId) {
        return NextResponse.json(
          { error: 'Only the owner can generate for this artist' },
          { status: 403 }
        );
      }
    }

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const webhookUrl = callback.webhookUrl;
    if (!musicGptWebhookSecret()) {
      console.error(
        '[MusicGPT API Route] MUSICGPT_WEBHOOK_SECRET is not set; MusicGPT callbacks will be rejected'
      );
    }
    const webhookUrlForLog = musicGptWebhookUrlForLog();
    if (webhookUrlForLog) {
      console.log('[MusicGPT API Route] Webhook URL being set:', webhookUrlForLog);
    }

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
    if (error instanceof HttpError) return errorResponse(error);
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

