import { NextResponse } from 'next/server';
import { createMusicGPTSong } from '@/lib/ai/providers/musicgpt';

/**
 * Server-side API route for initiating MusicGPT generation.
 * This ensures API keys are never exposed to the client.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, music_style, isInstrumental, lyrics } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Hardcode webhook URL to production
    const webhookBaseUrl = 'https://www.streamstar.xyz';
    const webhookUrl = `${webhookBaseUrl}/api/webhooks/musicgpt`;

    console.log('[MusicGPT API Route] Webhook URL being set:', webhookUrl);

    const response = await createMusicGPTSong({
      prompt,
      music_style,
      isInstrumental,
      lyrics,
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
      raw: response,
    });
  } catch (error) {
    console.error('[MusicGPT API Route] Error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'MusicGPT request failed';
    console.error('[MusicGPT API Route] Error details:', {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

