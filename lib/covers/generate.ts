/**
 * Fal cover generate job: Flux poster → rehost → Luma Ray loop → rehost.
 * Fail-soft: never throw out to song/audio callers; song is marked failed.
 */

import { isFalConfigured, generateCoverLoop, generateCoverPoster } from '@/lib/ai/fal';
import { isFragileCdn } from '@/lib/images/artistFace';
import { getAdminDb, isFirebaseAdminConfigured } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getArtistAdmin, getSongAdmin } from '@/lib/x/artistStore';
import type { GenerationDocument, SongDocument } from '@/types/firestore';
import { isFalCoverPipeline } from './config';
import { clipCoverError, buildCoverLoopPrompt, buildCoverPosterPrompt } from './prompt';
import { mergeCoverProvider, updateSongCoverFields } from './store';
import {
  COVER_LOOP_OBJECT,
  COVER_POSTER_OBJECT,
  downloadRemoteBytes,
  uploadSongCoverObject,
} from './storage';

export interface CoverJobResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  songId: string;
  status?: SongDocument['coverMotionStatus'];
}

function usableLookUrl(url?: string | null): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return undefined;
  if (isFragileCdn(trimmed)) return undefined;
  return trimmed;
}

async function getLatestGeneration(songId: string): Promise<GenerationDocument | null> {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.generations)
    .where('songId', '==', songId)
    .get();

  const docs = snap.docs
    .map(docSnap => docSnap.data() as GenerationDocument)
    .sort((a, b) => {
      const aMs = typeof a.createdAt?.toMillis === 'function' ? a.createdAt.toMillis() : 0;
      const bMs = typeof b.createdAt?.toMillis === 'function' ? b.createdAt.toMillis() : 0;
      return bMs - aMs;
    });

  return docs[0] ?? null;
}

function generationPromptText(generation: GenerationDocument | null): string | null {
  const freeText = generation?.prompt?.freeText?.trim();
  if (freeText) return freeText;
  const structured = generation?.prompt?.structured;
  if (structured && typeof structured.prompt === 'string' && structured.prompt.trim()) {
    return structured.prompt.trim();
  }
  return null;
}

async function markFailed(song: SongDocument, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error ?? 'Cover job failed');
  console.error('[cover] job failed', { songId: song.id, error: message });
  try {
    await updateSongCoverFields(song.id, {
      coverMotionStatus: 'failed',
      coverMotionError: clipCoverError(message),
    });
  } catch (writeError) {
    console.error('[cover] failed to persist error crumb', song.id, writeError);
  }
}

/**
 * Run the Fal cover pipeline for one song. Safe to call more than once:
 * ready songs no-op; poster_ready resumes at Luma.
 */
export async function generateSongCover(songId: string): Promise<CoverJobResult> {
  if (!isFalCoverPipeline()) {
    return { ok: true, skipped: true, reason: 'COVER_PIPELINE is not fal', songId };
  }

  if (!isFirebaseAdminConfigured()) {
    console.error('[cover] Firebase Admin is not initialized; cannot run cover job');
    return { ok: false, songId, reason: 'Firebase Admin is not initialized' };
  }

  const song = await getSongAdmin(songId);
  if (!song || song.deletedAt) {
    return { ok: true, skipped: true, reason: 'Song missing or deleted', songId };
  }

  if (song.coverMotionStatus === 'ready' && song.coverPosterUrl && song.coverVideoUrl) {
    return { ok: true, skipped: true, reason: 'Cover already ready', songId, status: 'ready' };
  }

  if (!isFalConfigured()) {
    await markFailed(song, new Error('FAL_KEY is not set'));
    return { ok: false, songId, status: 'failed', reason: 'FAL_KEY is not set' };
  }

  try {
    if (song.coverMotionStatus !== 'poster_ready') {
      await updateSongCoverFields(song.id, {
        coverMotionStatus: 'pending',
        coverMotionError: null,
      });
    }

    const artist = await getArtistAdmin(song.artistId);
    const generation = await getLatestGeneration(song.id);
    const promptInput = {
      artistName: artist?.name,
      title: song.title,
      songPrompt: generationPromptText(generation),
      lore: artist?.lore,
      genres: artist?.styleDNA?.genres,
      moods: artist?.styleDNA?.moods,
      hasLockedLook: Boolean(usableLookUrl(artist?.avatarURL)),
    };

    let posterUrl = song.coverPosterUrl?.trim() || '';
    let coverProvider = song.coverProvider || null;

    if (song.coverMotionStatus !== 'poster_ready' || !posterUrl) {
      const poster = await generateCoverPoster({
        prompt: buildCoverPosterPrompt(promptInput),
        referenceImageUrl: usableLookUrl(artist?.avatarURL),
      });
      const posterBytes = await downloadRemoteBytes(poster.url);
      posterUrl = await uploadSongCoverObject({
        songId: song.id,
        filename: COVER_POSTER_OBJECT,
        buffer: posterBytes,
        contentType: 'image/jpeg',
      });
      coverProvider = mergeCoverProvider(coverProvider, {
        posterModel: poster.model,
        posterRequestId: poster.requestId ?? null,
      });
      await updateSongCoverFields(song.id, {
        coverPosterUrl: posterUrl,
        coverMotionStatus: 'poster_ready',
        coverMotionError: null,
        coverProvider,
        dualWriteAlbumCover: posterUrl,
      });
    }

    const loop = await generateCoverLoop({
      prompt: buildCoverLoopPrompt(promptInput),
      imageUrl: posterUrl,
    });
    const loopBytes = await downloadRemoteBytes(loop.url);
    const videoUrl = await uploadSongCoverObject({
      songId: song.id,
      filename: COVER_LOOP_OBJECT,
      buffer: loopBytes,
      contentType: 'video/mp4',
    });
    coverProvider = mergeCoverProvider(coverProvider, {
      loopModel: loop.model,
      loopRequestId: loop.requestId ?? null,
    });
    await updateSongCoverFields(song.id, {
      coverVideoUrl: videoUrl,
      coverMotionStatus: 'ready',
      coverMotionError: null,
      coverProvider,
    });

    return { ok: true, songId, status: 'ready' };
  } catch (error) {
    await markFailed(song, error);
    return {
      ok: false,
      songId,
      status: 'failed',
      reason: error instanceof Error ? error.message : 'Cover job failed',
    };
  }
}
