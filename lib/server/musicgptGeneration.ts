import { NextRequest, NextResponse } from 'next/server';
import {
  buildMusicGPTStyleFromArtistContext,
  createMusicGPTSong,
} from '@/lib/ai/providers/musicgpt';
import type { AIGenerationRequest } from '@/lib/ai/types';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { adminGetArtist } from '@/lib/server/artistsAdmin';
import { adminGetSong } from '@/lib/server/songsAdmin';
import {
  musicGptTaskLogId,
  saveMusicGptTaskBinding,
} from '@/lib/server/musicgptTaskBinding';
import type { SongDocument } from '@/types/firestore';
import {
  musicGptGenerationCallback,
  musicGptWebhookUrlForLog,
} from '@/lib/webhooks/baseUrl';
import { musicGptWebhookSecret } from '@/lib/webhooks/musicgptAuth';
import { redactForLog, redactSecrets } from '@/lib/webhooks/redactUrl';

export type MusicGptGenerationDeps = {
  verifyToken?: (idToken: string) => Promise<{ uid: string }>;
  getSong?: (songId: string) => Promise<SongDocument | null>;
  createMusic?: typeof createMusicGPTSong;
  saveTaskBinding?: typeof saveMusicGptTaskBinding;
};

let depsForTests: MusicGptGenerationDeps | null = null;

/** Test-only. Production requests always use the real Admin and MusicGPT clients. */
export function setMusicGptGenerationDepsForTests(deps: MusicGptGenerationDeps | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MusicGPT generation test hooks are disabled in production');
  }
  depsForTests = deps;
}

function generationDeps(): MusicGptGenerationDeps {
  if (process.env.NODE_ENV === 'production') return {};
  return depsForTests ?? {};
}

/**
 * Optional song id from the web client. Null means the caller did not send one
 * (TF 15 mobile). A non-string is rejected.
 */
export function readOptionalSongId(
  value: unknown
): { ok: true; songId: string | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, songId: null };
  if (typeof value !== 'string') return { ok: false, error: 'songId must be a string' };
  const trimmed = value.trim();
  return { ok: true, songId: trimmed || null };
}

/**
 * Start a MusicGPT generation and record musicgptTasks/{taskId} before the
 * task id is returned to the client.
 */
export async function postMusicGptGeneration(request: NextRequest): Promise<NextResponse> {
  try {
    // Fail before auth or MusicGPT. A generation with no callback hangs, and
    // the request Host is not a safe base for a URL that carries the token.
    const callback = musicGptGenerationCallback();
    if (!callback.ok) {
      return NextResponse.json({ error: callback.error }, { status: callback.status });
    }

    const deps = generationDeps();
    const userId = await requireUser(request, { verifyToken: deps.verifyToken });
    const body = await request.json();
    const { prompt, lyrics, artistContext, artistId, num_outputs, songId: songIdRaw } = body as {
      prompt?: string;
      lyrics?: string;
      artistContext?: AIGenerationRequest['artistContext'];
      artistId?: string;
      num_outputs?: 1 | 2;
      songId?: unknown;
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

    const songIdResult = readOptionalSongId(songIdRaw);
    if (!songIdResult.ok) {
      return NextResponse.json({ error: songIdResult.error }, { status: 400 });
    }
    let songId = songIdResult.songId;
    if (songId) {
      const song = await (deps.getSong ?? adminGetSong)(songId);
      if (!song) {
        return NextResponse.json({ error: 'Song not found' }, { status: 404 });
      }
      if (song.ownerId !== userId) {
        return NextResponse.json(
          { error: 'Only the owner can generate for this song' },
          { status: 403 }
        );
      }
    }

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
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

    const createMusic = deps.createMusic ?? createMusicGPTSong;
    const response = await createMusic({
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

    try {
      await (deps.saveTaskBinding ?? saveMusicGptTaskBinding)({
        taskId,
        uid: userId,
        songId,
        conversionIds,
      });
    } catch (bindingError) {
      console.error(`musicgpt_task_binding_failed ${musicGptTaskLogId(taskId)}`);
      throw bindingError;
    }

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
