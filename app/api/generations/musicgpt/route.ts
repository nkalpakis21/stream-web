import { NextResponse } from 'next/server';
import { createMusicGPTSong } from '@/lib/ai/providers/musicgpt';

/**
 * Server-side API route for initiating MusicGPT generation.
 * This ensures API keys are never exposed to the client.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, music_style, isInstrumental } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const response = await createMusicGPTSong({
      prompt,
      music_style,
      isInstrumental,
    });

    return NextResponse.json({
      taskId:
        (response.taskId as string | undefined) ||
        (response.job_id as string | undefined) ||
        (response.id as string | undefined) ||
        `musicgpt-${Date.now()}`,
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

