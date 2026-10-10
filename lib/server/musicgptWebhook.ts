import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type { GenerationDocument, SongVersionDocument } from '@/types/firestore';
import { getConversionDataByConversionID } from '@/lib/ai/providers/musicgpt';
import { maybePostSongLive } from '@/lib/x/postSong';
import { isFalCoverPipeline, shouldWriteMusicGptAlbumCover } from '@/lib/covers/config';
import { musicGptAlbumCoverSongUpdates } from '@/lib/covers/musicgptAlbum';
import { enqueueSongCoverGeneration } from '@/lib/covers/enqueue';
import {
  adminGetSong,
  adminGetSongVersions,
  adminSetPrimarySongVersion,
} from '@/lib/server/songsAdmin';
import {
  adminCreateArtistNewSongNotification,
  adminCreateSongReadyNotification,
} from '@/lib/server/notificationsAdmin';

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
}

async function findGenerationByTaskId(taskId: string) {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.generations)
    .where('providerTaskId', '==', taskId)
    .get();
  return snap.empty ? null : snap.docs[0];
}

export async function processMusicGptWebhook(
  body: MusicGPTWebhookPayload
): Promise<NextResponse> {
  if (!body.task_id) {
    console.error('[MusicGPT Webhook] Invalid payload structure:', body);
    return NextResponse.json(
      { error: 'Invalid payload: missing required field (task_id)' },
      { status: 400 }
    );
  }

  const db = getAdminDb();

  if (body.subtype === 'album_cover_generation') {
    if (!shouldWriteMusicGptAlbumCover()) {
      console.log(
        `[MusicGPT Webhook] Ignoring MusicGPT album cover write (COVER_PIPELINE=fal) task=${body.task_id}`
      );
      return NextResponse.json({ ok: true, ignored: 'album_cover' });
    }

    console.log(`[MusicGPT Webhook] Received album cover generation webhook for task ${body.task_id}`);
    const generationDoc = await findGenerationByTaskId(body.task_id);
    if (!generationDoc) {
      console.warn(`[MusicGPT Webhook] No generation found for album cover: task_id=${body.task_id}`);
      return NextResponse.json({ ok: true });
    }

    const generation = {
      ...(generationDoc.data() as GenerationDocument),
      id: (generationDoc.data() as GenerationDocument).id || generationDoc.id,
    };
    const song = await adminGetSong(generation.songId);
    if (!song) {
      console.warn(`[MusicGPT Webhook] Song not found for generation ${generation.id}`);
      return NextResponse.json({ ok: true });
    }

    const songUpdates = musicGptAlbumCoverSongUpdates(song, {
      albumCoverPath: body.image_path,
      albumCoverThumbnail: body.thumbnail_path,
    });
    if (Object.keys(songUpdates).length > 0) {
      await db.collection(COLLECTIONS.songs).doc(song.id).set(
        { ...songUpdates, updatedAt: Timestamp.now() },
        { merge: true }
      );
      console.log(`[MusicGPT Webhook] Updated album cover for song ${song.id}`);
    }

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

    let generationDoc = body.conversion_id
      ? (
          await db
            .collection(COLLECTIONS.generations)
            .where('providerConversionIds', 'array-contains', body.conversion_id)
            .get()
        ).docs[0]
      : undefined;

    if (!generationDoc) {
      generationDoc = (await findGenerationByTaskId(body.task_id)) ?? undefined;
    }

    if (!generationDoc) {
      console.warn(
        `[MusicGPT Webhook] No generation found for lyrics update: task_id=${body.task_id}, conversion_id=${body.conversion_id}`
      );
      return NextResponse.json({ ok: true });
    }

    const generation = {
      ...(generationDoc.data() as GenerationDocument),
      id: (generationDoc.data() as GenerationDocument).id || generationDoc.id,
    };
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

  if (!body.conversion_id) {
    console.error(
      '[MusicGPT Webhook] Invalid payload structure: conversion_id required for conversion completion webhook:',
      body
    );
    return NextResponse.json(
      { error: 'Invalid payload: conversion_id is required for conversion completion webhooks' },
      { status: 400 }
    );
  }

  if (!body.conversion_path) {
    console.error(
      '[MusicGPT Webhook] Invalid payload structure: conversion_path required for conversion completion webhook:',
      body
    );
    return NextResponse.json(
      { error: 'Invalid payload: conversion_path is required for conversion completion webhooks' },
      { status: 400 }
    );
  }

  let generationDoc = await findGenerationByTaskId(body.task_id);
  if (!generationDoc) {
    const pending = await db.collection(COLLECTIONS.generations).where('status', '==', 'pending').get();
    const processing = await db
      .collection(COLLECTIONS.generations)
      .where('status', '==', 'processing')
      .get();
    const match = [...pending.docs, ...processing.docs].find((doc) => {
      const gen = doc.data() as GenerationDocument;
      return gen.providerConversionIds?.includes(body.conversion_id!);
    });
    generationDoc = match ?? null;
  }

  if (!generationDoc) {
    console.warn(
      `[MusicGPT Webhook] No generation found for task_id: ${body.task_id} or conversion_id: ${body.conversion_id}`
    );
    return NextResponse.json({ ok: true });
  }

  const generation = {
    ...(generationDoc.data() as GenerationDocument),
    id: (generationDoc.data() as GenerationDocument).id || generationDoc.id,
  };

  if (generation.providerProcessedConversions?.includes(body.conversion_id)) {
    console.log(
      `[MusicGPT Webhook] Conversion ${body.conversion_id} already processed for generation ${generation.id}. Skipping.`
    );
    await tryPostSongLive(generation.songId, 'conversion-already-processed');
    return NextResponse.json({ ok: true });
  }

  if (generation.status === 'completed') {
    await tryPostSongLive(generation.songId, 'generation-already-completed');
    return NextResponse.json({ ok: true });
  }

  const song = await adminGetSong(generation.songId);
  if (!song) {
    return NextResponse.json({ error: 'Parent song not found' }, { status: 400 });
  }

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
    await tryPostSongLive(song.id, 'version-already-exists');
    return NextResponse.json({ ok: true });
  }

  const maxVersionNumber =
    existingVersions.reduce((max, v) => (v.versionNumber > max ? v.versionNumber : max), 0) || 0;
  const now = Timestamp.now();
  const versionRef = db.collection(COLLECTIONS.songVersions).doc();
  const versionId = versionRef.id;
  const hasExistingAudio = existingVersions.some((v) => Boolean(v.audioURL));

  const version: SongVersionDocument = {
    id: versionId,
    songId: song.id,
    versionNumber: maxVersionNumber + 1,
    title: song.title,
    createdBy: song.ownerId,
    createdAt: now as unknown as SongVersionDocument['createdAt'],
    parentVersionId: song.currentVersionId,
    audioURL: body.conversion_path,
    providerOutputId,
    isPrimary: !hasExistingAudio,
  };
  await versionRef.set(version);

  await tryPostSongLive(song.id, 'audio-written');

  if (!hasExistingAudio && isFalCoverPipeline()) {
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

  if (!hasExistingAudio) {
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
  const allProcessed =
    allConversionIds.length > 0 &&
    allConversionIds.every((id) => updatedProcessedConversions.includes(id));
  const shouldMarkCompleted = allProcessed || allConversionIds.length === 0;

  const conversionDetailsResponse = await getConversionDataByConversionID(body.conversion_id);
  if (conversionDetailsResponse && conversionDetailsResponse.success) {
    console.log(`[MusicGPT Webhook] Fetched additional details for conversion ${body.conversion_id}`);
  }

  const conversionMetadata: Record<string, unknown> = {
    conversion_path: body.conversion_path,
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
    if (Object.keys(songUpdates).length > 0) {
      await db.collection(COLLECTIONS.songs).doc(song.id).set(
        { ...songUpdates, updatedAt: Timestamp.now() },
        { merge: true }
      );
      console.log(`[MusicGPT Webhook] Updated album cover for song ${song.id}`);
    }
  }

  await db.collection(COLLECTIONS.generations).doc(generation.id).set(
    {
      providerProcessedConversions: updatedProcessedConversions,
      status: shouldMarkCompleted ? 'completed' : generation.status,
      completedAt: shouldMarkCompleted ? now : generation.completedAt,
      output: {
        audioURL: shouldMarkCompleted ? body.conversion_path : generation.output?.audioURL || null,
        stems: body.conversion_path_wav ? [body.conversion_path_wav] : null,
        metadata: {
          ...(generation.output?.metadata || {}),
          [`conversion_${body.conversion_id}`]: conversionMetadata,
        },
      },
    },
    { merge: true }
  );

  if (shouldMarkCompleted) {
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

    try {
      const revalidateUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/revalidate`
        : 'https://streamstar.xyz/api/revalidate';
      await fetch(revalidateUrl, {
        method: 'POST',
        headers: {
          'x-revalidate-secret': process.env.REVALIDATE_SECRET || '',
        },
      });
    } catch (error) {
      console.error('Failed to revalidate homepage:', error);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function songOwnerForMusicGptTask(taskId: string): Promise<string | null> {
  const generationDoc = await findGenerationByTaskId(taskId);
  if (!generationDoc) return null;
  const generation = generationDoc.data() as GenerationDocument;
  const song = await adminGetSong(generation.songId);
  return song?.ownerId ?? null;
}
