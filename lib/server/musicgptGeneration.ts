import { NextRequest, NextResponse } from 'next/server';
import {
  buildMusicGPTStyleFromArtistContext,
  createMusicGPTSong,
  MUSICGPT_DEFAULT_MODEL,
  musicGptApiVersion,
} from '@/lib/ai/providers/musicgpt';
import {
  artistDefaults,
  parseCreateOptions,
  resolveCreateRequest,
  styleInputFromArtistContext,
} from '@/lib/create/songOptions';
import type { AIGenerationRequest } from '@/lib/ai/types';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { adminGetArtist } from '@/lib/server/artistsAdmin';
import {
  adminGetSong,
  adminMarkSongGenerationFailed,
  adminNoteSongGenerationAccepted,
  adminSaveSongCreateOptions,
} from '@/lib/server/songsAdmin';
import { gateSongGenerationRetry } from '@/lib/server/songRetryGate';
import { GENERATION_TIMEOUT_MS } from '@/lib/songs/ownerTile';
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
import { platformFromRequest } from '@/lib/funnel/platform';
import { recordFunnelEvent } from '@/lib/server/funnel';
import { assertNoObjectionableContent } from '@/lib/server/objectionable';
import { readMusicGptCreditEstimate } from '@/lib/server/musicgptUsage';

export type MusicGptGenerationDeps = {
  verifyToken?: (idToken: string) => Promise<{ uid: string }>;
  getSong?: (songId: string) => Promise<SongDocument | null>;
  createMusic?: typeof createMusicGPTSong;
  saveTaskBinding?: typeof saveMusicGptTaskBinding;
  gateRetry?: typeof gateSongGenerationRetry;
  saveCreateOptions?: typeof adminSaveSongCreateOptions;
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
  let failureSong: { id: string; prompt: string; lyrics?: string } | null = null;
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
    const { prompt, lyrics, artistContext, artistId, songId: songIdRaw, createOptions: createOptionsRaw } =
      body as {
        prompt?: string;
        lyrics?: string;
        artistContext?: AIGenerationRequest['artistContext'];
        artistId?: string;
        songId?: unknown;
        createOptions?: unknown;
      };
    const resolved = resolveCreateRequest({
      musicStyle: buildMusicGPTStyleFromArtistContext(artistContext).music_style,
      options: parseCreateOptions(createOptionsRaw),
      lyrics: typeof lyrics === 'string' ? lyrics : undefined,
      defaults: artistDefaults(styleInputFromArtistContext(artistContext)),
    });

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
    let songTitle: string | undefined;
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
      songTitle = song.title;
    }

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }
    assertNoObjectionableContent(prompt, resolved.lyrics, songTitle);

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

    if (songId) {
      let gate: 'resubmit' | 'still_generating' = 'resubmit';
      try {
        gate = await (deps.gateRetry ?? gateSongGenerationRetry)(songId);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (!message.includes('Firebase Admin') && !message.includes('not initialized')) throw error;
      }
      if (gate === 'still_generating') {
        return NextResponse.json({ stillGenerating: true });
      }
      const current = await (deps.getSong ?? adminGetSong)(songId);
      const createdAtMs =
        current?.createdAt && typeof current.createdAt.toMillis === 'function'
          ? current.createdAt.toMillis()
          : 0;
      if (
        current &&
        current.audioReady !== true &&
        !current.deletedAt &&
        current.generationStatus !== 'failed' &&
        Date.now() - createdAtMs >= GENERATION_TIMEOUT_MS
      ) {
        try {
          await adminMarkSongGenerationFailed(songId, {
            prompt,
            lyrics: resolved.lyrics,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (!message.includes('Firebase Admin') && !message.includes('not initialized')) throw error;
        }
      }
      failureSong = {
        id: songId,
        prompt,
        ...(resolved.lyrics ? { lyrics: resolved.lyrics } : {}),
      };
    }

    const createMusic = deps.createMusic ?? createMusicGPTSong;
    const response = await createMusic({
      prompt,
      lyrics: resolved.lyrics,
      music_style: resolved.music_style,
      make_instrumental: resolved.make_instrumental,
      ...(resolved.gender ? { gender: resolved.gender } : {}),
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

    const apiVersion = musicGptApiVersion();
    const creditEstimate = readMusicGptCreditEstimate(response);
    const platform = platformFromRequest(request);
    const trimmedArtistId = typeof artistId === 'string' ? artistId.trim() : '';

    try {
      await (deps.saveTaskBinding ?? saveMusicGptTaskBinding)({
        taskId,
        uid: userId,
        songId,
        conversionIds,
        model: apiVersion === 'v2' ? MUSICGPT_DEFAULT_MODEL : null,
        apiVersion,
        platform,
        ...(creditEstimate != null ? { creditEstimate } : {}),
      });
    } catch (bindingError) {
      console.error(`musicgpt_task_binding_failed ${musicGptTaskLogId(taskId)}`);
      throw bindingError;
    }

    if (songId) {
      try {
        await adminNoteSongGenerationAccepted(songId);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (!message.includes('Firebase Admin') && !message.includes('not initialized')) {
          console.error('[MusicGPT API Route] Could not clear generation failure', error);
        }
      }
      if (resolved.persisted) {
        try {
          await (deps.saveCreateOptions ?? adminSaveSongCreateOptions)(songId, resolved.persisted);
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (!message.includes('Firebase Admin') && !message.includes('not initialized')) {
            console.error('[MusicGPT API Route] Could not save create options', error);
          }
        }
      }
    }

    try {
      recordFunnelEvent(
        userId,
        'first_song_started',
        {
          taskId,
          ...(songId ? { songId } : {}),
          ...(trimmedArtistId ? { artistId: trimmedArtistId } : {}),
        },
        platform
      );
      if (resolved.used.length > 0) {
        recordFunnelEvent(
          userId,
          'create_options_used',
          {
            ...(songId ? { songId } : {}),
            ...(trimmedArtistId ? { artistId: trimmedArtistId } : {}),
            options: resolved.used.join(','),
          },
          platform
        );
      }
    } catch (error) {
      console.error(
        '[funnel] first_song_started',
        error instanceof Error ? error.message : 'failed'
      );
    }

    return NextResponse.json({
      taskId,
      conversionIds,
      raw: redactForLog(response, musicGptWebhookSecret()),
    });
  } catch (error) {
    if (!(error instanceof HttpError) && failureSong) {
      try {
        await adminMarkSongGenerationFailed(failureSong.id, {
          prompt: failureSong.prompt,
          lyrics: failureSong.lyrics,
        });
      } catch (markError) {
        const message = markError instanceof Error ? markError.message : '';
        if (!message.includes('Firebase Admin') && !message.includes('not initialized')) {
          console.error('[MusicGPT API Route] Could not mark song failed', markError);
        }
      }
    }
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
