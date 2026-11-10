import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { notifyOwnerSongReady } from '@/lib/server/expoPush';
import { recordFunnelEvent, trackFunnelEvent, type FunnelPlatform } from '@/lib/server/funnel';
import { firstSongReadyProps } from '@/lib/server/songReady';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type { GenerationDocument, MusicGptUsageRecord, SongDocument, SongVersionDocument } from '@/types/firestore';
import { getConversionDataByConversionID } from '@/lib/ai/providers/musicgpt';
import { maybePostSongLive, sweepDeferredXPosts } from '@/lib/x/postSong';
import { isFalCoverPipeline, shouldWriteMusicGptAlbumCover } from '@/lib/covers/config';
import { musicGptAlbumCoverSongUpdates } from '@/lib/covers/musicgptAlbum';
import { isCoverModerationEnabled } from '@/lib/covers/moderation';
import { screenSongCover } from '@/lib/server/coverModeration';
import { enqueueSongCoverGeneration } from '@/lib/covers/enqueue';
import {
  adminGetSong,
  adminGetSongVersions,
  adminMarkSongGenerationFailed,
  adminSetPrimarySongVersion,
} from '@/lib/server/songsAdmin';
import {
  adminCreateArtistNewSongNotification,
  adminCreateSongReadyNotification,
} from '@/lib/server/notificationsAdmin';
import {
  findAuthorizedMusicGptGeneration,
  getMusicGptTaskBinding,
  musicGptTaskLogId,
  timestampMillis,
} from '@/lib/server/musicgptTaskBinding';
import {
  isMusicGptAudioStreamingEvent,
  logMusicGptUsage,
  musicGptDurationMs,
  resolveMusicGptUsageNumbers,
  safeMusicGptStreamingUrl,
} from '@/lib/server/musicgptUsage';
import { musicGptWebhookSecret } from '@/lib/webhooks/musicgptAuth';
import { redactForLog } from '@/lib/webhooks/redactUrl';
import { revalidateHomepage } from '@/lib/webhooks/revalidate';
import { persistConversionAudio } from '@/lib/server/songAudioStorage';
import { conversionIdsAfterLateTake } from '@/lib/songs/takes';
import { countsTowardTimeToSong, holdBeatPublish, readAudioJob } from '@/lib/songs/beatFirst';
import { isVoiceChangeGeneration } from '@/lib/songs/voiceChange';
import { noteBeatAttemptEnded, noteBeatAudioStored, noteSingOverFinished } from '@/lib/server/beatFirst';
import { noteVoiceChangeSettled } from '@/lib/server/voiceChange';

export interface MusicGPTWebhookPayload {
  success: boolean;
  conversion_type: string;
  task_id: string;
  conversion_id?: string;
  conversion_id_1?: string;
  conversion_id_2?: string;
  conversion_path?: string;
  conversion_path_wav?: string;
  conversion_duration?: number;
  is_flagged?: boolean;
  reason?: string;
  lyrics?: string;
  lyrics_timestamped?: unknown;
  title?: string;
  subtype?: string;
  image_path?: string;
  thumbnail_path?: string;
  album_cover_generator_output?: boolean;
  streaming_url?: string;
  model?: string;
  credit_estimate?: number | string;
  cost?: number | string;
  charged_cost?: number | string;
  credits_used?: number | string;
  credit_used?: number | string;
  /** Present when MusicGPT reports a failed task instead of a file. */
  status?: string;
}

/** A completion that must not publish audio. Streaming and cover events are not failures. */
export function isMusicGptFailureEvent(body: MusicGPTWebhookPayload): boolean {
  if (body.success === false) return true;
  if (body.is_flagged === true) return true;
  const status = typeof body.status === 'string' ? body.status.trim().toLowerCase() : '';
  return status === 'failed' || status === 'error' || status === 'failure';
}

/**
 * First stored audio makes a held song visible and refreshes New.
 * `publicOnReady` is the only signal that isPublic should flip on.
 * Songs that were already public keep isPublic and gain `audioReady`.
 * Returns true when a public shelf can newly include the song.
 */
async function publishFirstAudio(song: SongDocument): Promise<boolean> {
  if (song.deletedAt) return false;
  const updates: Record<string, unknown> = {};
  const becameVisible =
    song.audioReady === false || (song.publicOnReady === true && song.isPublic !== true);
  if (song.audioReady !== true) updates.audioReady = true;
  if (song.publicOnReady === true && song.isPublic !== true) updates.isPublic = true;
  if (song.generationStatus === 'failed') updates.generationStatus = FieldValue.delete();
  if (Object.keys(updates).length === 0) return false;
  updates.updatedAt = Timestamp.now();
  await getAdminDb().collection(COLLECTIONS.songs).doc(song.id).set(updates, { merge: true });
  return becameVisible;
}

function versionHasAudio(version: { audioURL?: string | null }): boolean {
  return typeof version.audioURL === 'string' && version.audioURL.trim().length > 0;
}

function webhookConversionId(body: MusicGPTWebhookPayload): string {
  return typeof body.conversion_id === 'string' ? body.conversion_id.trim() : '';
}

/**
 * A conversion that arrives after the generation is already completed.
 * Saves a non-primary version and nothing else: no primary flip, no
 * currentVersionId write, no notifications, X posts, covers, or counts.
 * A repeat of the same conversion id does not create another version.
 */
async function saveLateTake(
  generation: GenerationDocument,
  body: MusicGPTWebhookPayload
): Promise<NextResponse> {
  const conversionId = webhookConversionId(body);
  const db = getAdminDb();
  const song = await adminGetSong(generation.songId);
  if (!song) {
    return NextResponse.json({ error: 'Parent song not found' }, { status: 400 });
  }
  if (song.deletedAt) {
    return NextResponse.json({ ok: true, ignored: 'deleted' });
  }

  const existingVersions = await adminGetSongVersions(song.id);
  const already = existingVersions.find((version) => version.providerOutputId === conversionId);
  let storedAudioURL: string | null = null;
  let audioPersisted: boolean | null = null;

  if (!already) {
    const sourceUrl = typeof body.conversion_path === 'string' ? body.conversion_path : '';
    if (!sourceUrl) {
      return NextResponse.json(
        { error: 'Invalid payload: conversion_path is required for conversion completion webhooks' },
        { status: 400 }
      );
    }
    const maxVersionNumber =
      existingVersions.reduce((max, version) => (version.versionNumber > max ? version.versionNumber : max), 0) ||
      0;
    const now = Timestamp.now();
    const versionRef = db.collection(COLLECTIONS.songVersions).doc();
    const persisted = await persistConversionAudio({
      songId: song.id,
      conversionId,
      sourceUrl,
    });
    storedAudioURL = persisted.audioURL;
    audioPersisted = persisted.audioPersisted;
    const version: SongVersionDocument = {
      id: versionRef.id,
      songId: song.id,
      versionNumber: maxVersionNumber + 1,
      title: song.title,
      createdBy: song.ownerId,
      createdAt: now as unknown as SongVersionDocument['createdAt'],
      parentVersionId: song.currentVersionId || null,
      audioURL: persisted.audioURL,
      musicgptAudioUrl: persisted.musicgptAudioUrl,
      audioPersisted: persisted.audioPersisted,
      providerOutputId: conversionId,
      isPrimary: false,
    };
    await versionRef.set(version);
    console.log(
      `[MusicGPT Webhook] Saved late take ${conversionId} for song ${song.id} without changing the current take`
    );
  }

  const processed = [...(generation.providerProcessedConversions || [])];
  if (conversionId && !processed.includes(conversionId)) processed.push(conversionId);
  const conversionIds = conversionIdsAfterLateTake(
    generation.providerConversionIds,
    existingVersions,
    conversionId
  );
  const failed = (generation.providerFailedConversions || []).filter((id) => id !== conversionId);
  const priorOutput = generation.output || { audioURL: null, stems: null, metadata: {} };
  const conversionMetadata: Record<string, unknown> = {
    conversion_path: body.conversion_path,
    lateTake: true,
  };
  if (storedAudioURL) conversionMetadata.storedAudioURL = storedAudioURL;
  if (audioPersisted != null) conversionMetadata.audioPersisted = audioPersisted;
  if (body.conversion_duration !== undefined) {
    conversionMetadata.conversion_duration = body.conversion_duration;
  }

  await db.collection(COLLECTIONS.generations).doc(generation.id).set(
    {
      providerProcessedConversions: processed,
      providerConversionIds: conversionIds,
      providerFailedConversions: failed,
      output: {
        audioURL: priorOutput.audioURL ?? null,
        stems: priorOutput.stems ?? null,
        metadata: {
          ...(priorOutput.metadata || {}),
          [`conversion_${conversionId}`]: conversionMetadata,
        },
      },
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true, lateTake: true });
}

/**
 * One named take failed, or a failure arrived after another take already has audio.
 * Records the failed conversion and, the first time every take is accounted for,
 * runs completion once. Does not move currentVersionId or isPrimary.
 * Returns false when the whole job should still use the no-audio failure path.
 */
async function recordPartialTakeFailure(
  generation: GenerationDocument,
  body: MusicGPTWebhookPayload
): Promise<boolean> {
  const ids = (generation.providerConversionIds || []).filter((id) => id.trim());
  const explicit = webhookConversionId(body);
  const knownExplicit = Boolean(explicit) && ids.includes(explicit);
  const song = await adminGetSong(generation.songId);
  if (!song || song.deletedAt) return false;
  const versions = await adminGetSongVersions(song.id);
  const hasAudio = versions.some(versionHasAudio);
  if (!knownExplicit && !hasAudio) return false;
  if (knownExplicit && ids.length < 2 && !hasAudio) return false;

  const processed = new Set(generation.providerProcessedConversions || []);
  const alreadyFailed = new Set(generation.providerFailedConversions || []);
  const failedIds = knownExplicit
    ? [explicit]
    : ids.filter((id) => !processed.has(id) && !alreadyFailed.has(id));
  const providerFailedConversions = [...alreadyFailed];
  for (const id of failedIds) {
    if (!providerFailedConversions.includes(id)) providerFailedConversions.push(id);
  }

  const db = getAdminDb();
  await db.collection(COLLECTIONS.generations).doc(generation.id).set(
    { providerFailedConversions },
    { merge: true }
  );

  const accounted =
    ids.length > 0 &&
    ids.every((id) => processed.has(id) || providerFailedConversions.includes(id));
  if (
    isVoiceChangeGeneration(generation.parameters) &&
    hasAudio &&
    accounted &&
    generation.status !== 'completed'
  ) {
    const now = Timestamp.now();
    await db.collection(COLLECTIONS.generations).doc(generation.id).set(
      { status: 'completed', completedAt: now },
      { merge: true }
    );
    try {
      await noteVoiceChangeSettled(song.id, generation.id, 'ready');
    } catch (error) {
      console.error('[voice-change] settle', error instanceof Error ? error.message : 'failed');
    }
    return true;
  }
  if (hasAudio && accounted && generation.status !== 'completed') {
    const now = Timestamp.now();
    await db.collection(COLLECTIONS.generations).doc(generation.id).set(
      { status: 'completed', completedAt: now },
      { merge: true }
    );
    try {
      await adminCreateSongReadyNotification({
        userId: song.ownerId,
        songId: song.id,
        generationId: generation.id,
      });
    } catch (error) {
      console.error('[MusicGPT Webhook] Failed to create song-ready notification:', error);
    }
    try {
      await adminCreateArtistNewSongNotification({
        artistId: song.artistId,
        songId: song.id,
        generationId: generation.id,
      });
    } catch (error) {
      console.error('[MusicGPT Webhook] Failed to create follower notifications:', error);
    }
    await tryPostSongLive(song.id, 'generation-completed');
    await revalidateHomepage();
  }

  return true;
}

/** Provider said the job failed and no playable file should be published. */
async function recordMusicGptFailure(body: MusicGPTWebhookPayload): Promise<void> {
  const generation = await loadAuthorizedGeneration(body.task_id);
  const binding = generation ? null : await getMusicGptTaskBinding(body.task_id);
  const songId =
    generation?.songId ?? (typeof binding?.songId === 'string' ? binding.songId : null);
  if (!songId) return;
  if (generation && (await recordPartialTakeFailure(generation, body))) return;
  const marked = await adminMarkSongGenerationFailed(songId);
  if (generation?.parameters?.job === 'beat') {
    try {
      await noteBeatAttemptEnded(songId);
    } catch (error) {
      console.error('[beat-first] beat failed', error instanceof Error ? error.message : 'failed');
    }
  }
  if (generation && isVoiceChangeGeneration(generation.parameters)) {
    try {
      await noteVoiceChangeSettled(songId, generation.id, 'failed');
    } catch (error) {
      console.error('[voice-change] failed', error instanceof Error ? error.message : 'failed');
    }
  }
  if (!marked || !generation) return;
  const reason =
    typeof body.reason === 'string' && body.reason.trim()
      ? body.reason.trim().slice(0, 300)
      : 'MusicGPT reported a failure';
  await getAdminDb().collection(COLLECTIONS.generations).doc(generation.id).set(
    {
      status: 'failed',
      error: reason,
      completedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

async function tryPostSongLive(songId: string, reason: string): Promise<void> {
  try {
    const xResult = await maybePostSongLive(songId);
    if (!xResult.ok) {
      console.log(`[MusicGPT Webhook] X song-live post (${reason}):`, xResult);
    } else {
      console.log(`[MusicGPT Webhook] X song-live post (${reason}): posted`, xResult.tweetId);
    }
  } catch (error) {
    console.error(`[MusicGPT Webhook] X song-live post failed (${reason}):`, error);
  }
  try {
    await sweepDeferredXPosts(8);
  } catch (error) {
    console.error('[MusicGPT Webhook] X deferred sweep failed:', error);
  }
}

/**
 * Generation this task is allowed to update. Unbound and mismatched task ids
 * return null without writing. Missing generations log the existing warning.
 */
async function loadAuthorizedGeneration(taskId: string): Promise<GenerationDocument | null> {
  const lookup = await findAuthorizedMusicGptGeneration(taskId);
  if (!lookup.ok) {
    if (lookup.reason === 'missing') {
      console.warn(
        `[MusicGPT Webhook] No generation found for task_id: ${musicGptTaskLogId(taskId)}`
      );
    }
    return null;
  }
  return lookup.generation;
}

export async function processMusicGptWebhook(
  body: MusicGPTWebhookPayload
): Promise<NextResponse> {
  if (!body.task_id) {
    console.error(
      '[MusicGPT Webhook] Invalid payload structure:',
      redactForLog(body, musicGptWebhookSecret())
    );
    return NextResponse.json(
      { error: 'Invalid payload: missing required field (task_id)' },
      { status: 400 }
    );
  }

  const db = getAdminDb();

  async function persistMusicGptAlbumCover(
    songId: string,
    updates: { albumCoverPath?: string | null; albumCoverThumbnail?: string | null }
  ): Promise<void> {
    if (Object.keys(updates).length === 0) return;
    const payload: Record<string, unknown> = {
      ...updates,
      updatedAt: Timestamp.now(),
    };
    if (isCoverModerationEnabled()) {
      payload.coverModeration = {
        status: 'pending',
        checkedAt: Timestamp.now(),
        labels: null,
      };
    }
    await db.collection(COLLECTIONS.songs).doc(songId).set(payload, { merge: true });
    console.log(`[MusicGPT Webhook] Updated album cover for song ${songId}`);
    if (isCoverModerationEnabled()) {
      await screenSongCover(songId);
    }
  }

  if (body.subtype === 'album_cover_generation') {
    if (!shouldWriteMusicGptAlbumCover()) {
      console.log(
        `[MusicGPT Webhook] Ignoring MusicGPT album cover write (COVER_PIPELINE=fal) task=${body.task_id}`
      );
      return NextResponse.json({ ok: true, ignored: 'album_cover' });
    }

    console.log(`[MusicGPT Webhook] Received album cover generation webhook for task ${body.task_id}`);
    const generation = await loadAuthorizedGeneration(body.task_id);
    if (!generation) {
      return NextResponse.json({ ok: true });
    }
    const song = await adminGetSong(generation.songId);
    if (!song) {
      console.warn(`[MusicGPT Webhook] Song not found for generation ${generation.id}`);
      return NextResponse.json({ ok: true });
    }

    const songUpdates = musicGptAlbumCoverSongUpdates(song, {
      albumCoverPath: body.image_path,
      albumCoverThumbnail: body.thumbnail_path,
    });
    await persistMusicGptAlbumCover(song.id, songUpdates);

    const albumCoverMetadata: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
      subtype: body.subtype,
    };
    if (body.image_path !== undefined) albumCoverMetadata.image_path = body.image_path;
    if (body.thumbnail_path !== undefined) albumCoverMetadata.thumbnail_path = body.thumbnail_path;
    if (body.album_cover_generator_output !== undefined) {
      albumCoverMetadata.album_cover_generator_output = body.album_cover_generator_output;
    }
    if (body.conversion_id_1 !== undefined) albumCoverMetadata.conversion_id_1 = body.conversion_id_1;
    if (body.conversion_id_2 !== undefined) albumCoverMetadata.conversion_id_2 = body.conversion_id_2;

    await db.collection(COLLECTIONS.generations).doc(generation.id).set(
      {
        output: {
          ...(generation.output || { audioURL: null, stems: null, metadata: {} }),
          metadata: {
            ...(generation.output?.metadata || {}),
            album_cover_generation: albumCoverMetadata,
          },
        },
      },
      { merge: true }
    );
    return NextResponse.json({ ok: true });
  }

  if (body.subtype === 'lyrics_timestamped' || body.subtype === 'lyrics') {
    console.log(`[MusicGPT Webhook] Received lyrics update webhook for conversion ${body.conversion_id}`);

    // Conversion ids are world-readable on public songs. Only the generation
    // authorized for this task id may receive lyrics.
    const generation = await loadAuthorizedGeneration(body.task_id);
    if (!generation) {
      return NextResponse.json({ ok: true });
    }
    const lyricsMetadata: Record<string, unknown> = { updatedAt: Timestamp.now() };
    if (body.lyrics_timestamped !== undefined) {
      lyricsMetadata.lyrics_timestamped = body.lyrics_timestamped;
    }
    if (body.lyrics !== undefined) lyricsMetadata.lyrics = body.lyrics;
    if (body.subtype !== undefined) lyricsMetadata.subtype = body.subtype;

    await db.collection(COLLECTIONS.generations).doc(generation.id).set(
      {
        output: {
          ...(generation.output || { audioURL: null, stems: null, metadata: {} }),
          metadata: {
            ...(generation.output?.metadata || {}),
            [`conversion_${body.conversion_id}_lyrics`]: lyricsMetadata,
          },
        },
      },
      { merge: true }
    );
    console.log(`[MusicGPT Webhook] Updated lyrics for generation ${generation.id}`);
    return NextResponse.json({ ok: true });
  }

  // v2 can post subtype audio_streaming (documented for pro models) before
  // the file exists. That payload has no conversion_path. Accept it so the
  // later lyrics, cover, and conversion_path webhooks can still finish the song.
  if (isMusicGptAudioStreamingEvent(body)) {
    const streamingUrl = safeMusicGptStreamingUrl(body.streaming_url);
    if (streamingUrl && body.conversion_id) {
      try {
        await rememberMusicGptStreamingUrl(body.task_id, body.conversion_id, streamingUrl);
        console.log(
          `[MusicGPT Webhook] Stored audio streaming URL task=${body.task_id} conversion=${body.conversion_id}`
        );
      } catch (error) {
        console.error('[MusicGPT Webhook] Failed to store streaming URL:', error);
      }
    } else {
      console.log(
        `[MusicGPT Webhook] Ignoring audio streaming webhook task=${body.task_id} conversion=${body.conversion_id ?? ''}`
      );
    }
    return NextResponse.json({ ok: true, ignored: 'audio_streaming' });
  }

  if (isMusicGptFailureEvent(body)) {
    await recordMusicGptFailure(body);
    return NextResponse.json({ ok: true, failed: true });
  }

  if (!body.conversion_id) {
    console.error(
      '[MusicGPT Webhook] Invalid payload structure: conversion_id required for conversion completion webhook:',
      redactForLog(body, musicGptWebhookSecret())
    );
    return NextResponse.json(
      { error: 'Invalid payload: conversion_id is required for conversion completion webhooks' },
      { status: 400 }
    );
  }

  if (!body.conversion_path) {
    console.error(
      '[MusicGPT Webhook] Invalid payload structure: conversion_path required for conversion completion webhook:',
      redactForLog(body, musicGptWebhookSecret())
    );
    return NextResponse.json(
      { error: 'Invalid payload: conversion_path is required for conversion completion webhooks' },
      { status: 400 }
    );
  }

  // Do not scan pending generations by conversion id. That id is copied the
  // same way as providerTaskId. The binding (or one recent unbound
  // generation) is the only accepted target.
  const generation = await loadAuthorizedGeneration(body.task_id);
  if (!generation) {
    return NextResponse.json({ ok: true });
  }

  if (generation.providerProcessedConversions?.includes(body.conversion_id)) {
    console.log(
      `[MusicGPT Webhook] Conversion ${body.conversion_id} already processed for generation ${generation.id}. Skipping.`
    );
    await tryPostSongLive(generation.songId, 'conversion-already-processed');
    return NextResponse.json({ ok: true });
  }

  if (generation.status === 'completed') {
    return saveLateTake(generation, body);
  }

  const song = await adminGetSong(generation.songId);
  if (!song) {
    return NextResponse.json({ error: 'Parent song not found' }, { status: 400 });
  }
  // A soft-deleted shell does not come back. A timed-out or failed shell still
  // accepts the first audio and clears that state inside publishFirstAudio.
  if (song.deletedAt) {
    return NextResponse.json({ ok: true, ignored: 'deleted' });
  }

  const taskBinding = await getMusicGptTaskBinding(body.task_id);
  const audioJob = readAudioJob(taskBinding?.job, generation.parameters?.job);
  const voiceChange = isVoiceChangeGeneration(generation.parameters);
  const holdPublish = holdBeatPublish({
    path: song.path,
    job: audioJob,
    stage: song.beatFirst?.stage,
  });
  const skipTimeToSong = !countsTowardTimeToSong(song.path);

  const existingVersions = await adminGetSongVersions(song.id);
  const existingProviderOutputIds = new Set(
    existingVersions.map((v) => v.providerOutputId).filter((id): id is string => !!id)
  );
  const providerOutputId = body.conversion_id;

  if (existingProviderOutputIds.has(providerOutputId)) {
    console.log(
      `[MusicGPT Webhook] Conversion ${providerOutputId} already exists as song version. Skipping.`
    );
    await db.collection(COLLECTIONS.generations).doc(generation.id).set(
      {
        providerProcessedConversions: [
          ...(generation.providerProcessedConversions || []),
          body.conversion_id,
        ],
      },
      { merge: true }
    );
    if (!holdPublish && existingVersions.some(versionHasAudio)) {
      const visible = await publishFirstAudio(song);
      if (visible) await revalidateHomepage();
    }
    if (!holdPublish) await tryPostSongLive(song.id, 'version-already-exists');
    return NextResponse.json({ ok: true });
  }

  const maxVersionNumber =
    existingVersions.reduce((max, v) => (v.versionNumber > max ? v.versionNumber : max), 0) || 0;
  const now = Timestamp.now();
  const versionRef = db.collection(COLLECTIONS.songVersions).doc();
  const versionId = versionRef.id;
  const hasExistingAudio = existingVersions.some((v) => Boolean(v.audioURL));

  // MusicGPT deletes conversion_path after about 90 days. Copy the MP3 into
  // our bucket first. A failed copy still saves their URL so the song plays,
  // with audioPersisted false for the backfill. Retries reuse the same object.
  // v1 and v2 completion both arrive here; audio_streaming returns above.
  const persisted = await persistConversionAudio({
    songId: song.id,
    conversionId: body.conversion_id,
    sourceUrl: body.conversion_path,
  });

  const version: SongVersionDocument = {
    id: versionId,
    songId: song.id,
    versionNumber: maxVersionNumber + 1,
    title: song.title,
    createdBy: song.ownerId,
    createdAt: now as unknown as SongVersionDocument['createdAt'],
    parentVersionId: song.currentVersionId,
    audioURL: persisted.audioURL,
    musicgptAudioUrl: persisted.musicgptAudioUrl,
    audioPersisted: persisted.audioPersisted,
    providerOutputId,
    isPrimary: voiceChange ? false : !hasExistingAudio,
  };
  await versionRef.set(version);

  if (persisted.audioPersisted && !skipTimeToSong && !voiceChange) {
    try {
      const binding = taskBinding;
      const stored = binding?.platform;
      const platform: FunnelPlatform =
        stored === 'web' || stored === 'ios' || stored === 'unknown' ? stored : 'unknown';
      recordFunnelEvent(
        song.ownerId,
        'first_song_ready',
        firstSongReadyProps(song, body.task_id, Date.now()),
        platform
      );
    } catch (error) {
      console.error(
        '[funnel] first_song_ready',
        error instanceof Error ? error.message : 'failed'
      );
    }
    if (!hasExistingAudio && typeof song.artistId === 'string' && song.artistId) {
      notifyOwnerSongReady({
        ownerId: song.ownerId,
        title: song.title,
        songId: song.id,
        artistId: song.artistId,
      });
    }
  }

  let catalogRevalidate = false;
  if (versionHasAudio(version) && !holdPublish && !voiceChange) {
    catalogRevalidate = await publishFirstAudio(song);
  }

  if (!holdPublish && !voiceChange) {
    await tryPostSongLive(song.id, 'audio-written');
  }

  if (audioJob === 'beat') {
    try {
      await noteBeatAudioStored(song);
    } catch (error) {
      console.error('[beat-first] note beat', error instanceof Error ? error.message : 'failed');
    }
  }

  if (!hasExistingAudio && !holdPublish && !voiceChange && isFalCoverPipeline()) {
    try {
      if (
        song.coverMotionStatus !== 'ready' &&
        song.coverMotionStatus !== 'pending' &&
        song.coverMotionStatus !== 'poster_ready'
      ) {
        await db.collection(COLLECTIONS.songs).doc(song.id).set(
          {
            coverMotionStatus: 'pending',
            coverMotionError: null,
            coverUpdatedAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
      }
      enqueueSongCoverGeneration(song.id);
    } catch (error) {
      console.error('[MusicGPT Webhook] Cover enqueue failed (audio path continues):', error);
    }
  }

  if (!hasExistingAudio && !voiceChange) {
    try {
      await adminSetPrimarySongVersion(song.id, versionId);
    } catch (error) {
      console.error('[MusicGPT Webhook] Failed to set primary version:', error);
    }
  }

  const updatedProcessedConversions = [
    ...(generation.providerProcessedConversions || []),
    body.conversion_id,
  ];
  const allConversionIds = generation.providerConversionIds || [];
  const failedConversionIds = new Set(generation.providerFailedConversions || []);
  const allAccounted =
    allConversionIds.length > 0 &&
    allConversionIds.every(
      (id) => updatedProcessedConversions.includes(id) || failedConversionIds.has(id)
    );
  const shouldMarkCompleted = allAccounted || allConversionIds.length === 0;

  const conversionDetailsResponse = await getConversionDataByConversionID(body.conversion_id);
  if (conversionDetailsResponse && conversionDetailsResponse.success) {
    console.log(`[MusicGPT Webhook] Fetched additional details for conversion ${body.conversion_id}`);
  }

  const conversionMetadata: Record<string, unknown> = {
    conversion_path: body.conversion_path,
    storedAudioURL: persisted.audioURL,
    audioPersisted: persisted.audioPersisted,
  };
  if (body.title) conversionMetadata.title = body.title;
  if (body.conversion_path_wav) conversionMetadata.conversion_path_wav = body.conversion_path_wav;
  if (body.conversion_duration !== undefined) {
    conversionMetadata.conversion_duration = body.conversion_duration;
  }
  if (body.lyrics) conversionMetadata.lyrics = body.lyrics;
  if (body.lyrics_timestamped) conversionMetadata.lyrics_timestamped = body.lyrics_timestamped;

  if (conversionDetailsResponse && conversionDetailsResponse.success) {
    const conversion = conversionDetailsResponse.conversion;
    conversionMetadata.fullDetails = conversion;
    if (conversion.status) conversionMetadata.status = conversion.status;
    if (conversion.createdAt) conversionMetadata.created_at = conversion.createdAt;
    if (conversion.updatedAt) conversionMetadata.updated_at = conversion.updatedAt;

    const songUpdates = musicGptAlbumCoverSongUpdates(song, {
      albumCoverPath: conversion.album_cover_path as string | undefined,
      albumCoverThumbnail: conversion.album_cover_thumbnail as string | undefined,
    });
    if (!voiceChange) await persistMusicGptAlbumCover(song.id, songUpdates);
  }

  let musicGptUsage: MusicGptUsageRecord | undefined;
  if (shouldMarkCompleted) {
    try {
      const binding = taskBinding;
      const startedAtMs = timestampMillis(binding?.createdAt) ?? timestampMillis(generation.createdAt);
      const completedAtMs = now.toMillis();
      const observed = resolveMusicGptUsageNumbers({
        webhook: body as unknown as Record<string, unknown>,
        conversion:
          conversionDetailsResponse?.success && conversionDetailsResponse.conversion
            ? (conversionDetailsResponse.conversion as Record<string, unknown>)
            : null,
        metadata: (generation.output?.metadata as Record<string, unknown> | undefined) ?? null,
        bindingCreditEstimate: binding?.creditEstimate ?? null,
        bindingModel: binding?.model ?? null,
        bindingApiVersion: binding?.apiVersion ?? null,
      });
      musicGptUsage = {
        ...observed,
        durationMs: musicGptDurationMs(startedAtMs, completedAtMs),
        taskId: body.task_id,
        songId: song.id,
        generationId: generation.id,
        startedAtMs,
        completedAtMs,
      };
      logMusicGptUsage(musicGptUsage);
    } catch (error) {
      console.error('[MusicGPT Webhook] Failed to record usage:', error);
    }
  }

  await db.collection(COLLECTIONS.generations).doc(generation.id).set(
    {
      providerProcessedConversions: updatedProcessedConversions,
      status: shouldMarkCompleted ? 'completed' : generation.status,
      completedAt: shouldMarkCompleted ? now : generation.completedAt,
      ...(musicGptUsage ? { musicGptUsage } : {}),
      output: {
        audioURL: shouldMarkCompleted ? persisted.audioURL : generation.output?.audioURL || null,
        stems: body.conversion_path_wav ? [body.conversion_path_wav] : null,
        metadata: {
          ...(generation.output?.metadata || {}),
          [`conversion_${body.conversion_id}`]: conversionMetadata,
        },
      },
    },
    { merge: true }
  );

  if (audioJob === 'sing_over' && versionHasAudio(version) && !voiceChange) {
    try {
      const noted = await noteSingOverFinished(song, generation.id);
      if (noted.logVocals) {
        const platform: FunnelPlatform =
          taskBinding?.platform === 'web' || taskBinding?.platform === 'ios' || taskBinding?.platform === 'unknown'
            ? taskBinding.platform
            : 'unknown';
        await trackFunnelEvent(
          song.ownerId,
          'vocals_added',
          {
            songId: song.id,
            artistId: song.artistId,
            vocalsAdded: true,
            ...(noted.msFromFirstBeat != null ? { msFromFirstBeat: noted.msFromFirstBeat } : {}),
          },
          platform
        );
      }
    } catch (error) {
      console.error('[funnel] vocals_added', error instanceof Error ? error.message : 'failed');
    }
  }

  if (voiceChange && versionHasAudio(version)) {
    try {
      await noteVoiceChangeSettled(song.id, generation.id, shouldMarkCompleted ? 'ready' : 'making');
    } catch (error) {
      console.error('[voice-change] settle', error instanceof Error ? error.message : 'failed');
    }
  }

  if (shouldMarkCompleted && !holdPublish && !voiceChange) {
    try {
      await adminCreateSongReadyNotification({
        userId: song.ownerId,
        songId: song.id,
        generationId: generation.id,
      });
    } catch (error) {
      console.error('[MusicGPT Webhook] Failed to create song-ready notification:', error);
    }

    try {
      await adminCreateArtistNewSongNotification({
        artistId: song.artistId,
        songId: song.id,
        generationId: generation.id,
      });
    } catch (error) {
      console.error('[MusicGPT Webhook] Failed to create follower notifications:', error);
    }

    await tryPostSongLive(song.id, 'generation-completed');
  }

  if (catalogRevalidate || shouldMarkCompleted) {
    await revalidateHomepage();
  }

  return NextResponse.json({ ok: true });
}

async function rememberMusicGptStreamingUrl(
  taskId: string,
  conversionId: string,
  streamingUrl: string
): Promise<void> {
  const ref = getAdminDb().collection(COLLECTIONS.musicgptTasks).doc(taskId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as { streamingByConversionId?: unknown } | undefined;
  const existing = data?.streamingByConversionId;
  const map: Record<string, string> =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? Object.fromEntries(
          Object.entries(existing as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
          )
        )
      : {};
  map[conversionId] = streamingUrl;
  await ref.set({ streamingByConversionId: map }, { merge: true });
}

export async function songOwnerForMusicGptTask(taskId: string): Promise<string | null> {
  const lookup = await findAuthorizedMusicGptGeneration(taskId);
  if (!lookup.ok) return null;
  const song = await adminGetSong(lookup.generation.songId);
  return song?.ownerId ?? null;
}
