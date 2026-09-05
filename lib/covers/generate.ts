/**
 * Fal cover generate job: Flux poster → rehost → Luma Ray loop → rehost.
 * Fail-soft: never throw out to song/audio callers.
 * `failed` only if the poster never landed. Luma errors stay `poster_ready`.
 */

import { isFalConfigured, generateCoverLoop, generateCoverPoster } from '@/lib/ai/fal';
import { getAdminDb, isFirebaseAdminConfigured } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { parseLyricsFromMetadata } from '@/lib/utils/lyrics';
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

function firstTrimmedString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

/**
 * Lyrics if they already landed on the generation. Cover jobs do not wait
 * for a later lyrics webhook — missing lyrics just omit that prompt beat.
 */
function generationLyricsText(generation: GenerationDocument | null): string | null {
  if (!generation) return null;

  const fromFields = firstTrimmedString(
    generation.prompt?.structured?.lyrics,
    generation.parameters?.lyrics
  );
  if (fromFields) return fromFields;

  const metadata = generation.output?.metadata;
  if (metadata && typeof metadata === 'object') {
    const parsed = parseLyricsFromMetadata(metadata);
    if (parsed?.raw?.trim()) return parsed.raw.trim();
  }

  return null;
}

/**
 * Persist a cover-job error without wiping a landed poster.
 * Luma/storage-after-poster stays `poster_ready` so stills remain usable.
 * `failed` is only for Flux/storage failure before a poster URL exists.
 */
async function persistCoverJobError(
  song: SongDocument,
  error: unknown,
  posterLanded: boolean
): Promise<NonNullable<SongDocument['coverMotionStatus']>> {
  const message = error instanceof Error ? error.message : String(error ?? 'Cover job failed');
  const status = posterLanded ? 'poster_ready' : 'failed';
  console.error('[cover] job failed', { songId: song.id, status, error: message });
  try {
    await updateSongCoverFields(song.id, {
      coverMotionStatus: status,
      coverMotionError: clipCoverError(message),
    });
  } catch (writeError) {
    console.error('[cover] failed to persist error crumb', song.id, writeError);
  }
  return status;
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

  let posterUrl = song.coverPosterUrl?.trim() || '';
  let posterLanded = Boolean(posterUrl);

  if (!isFalConfigured()) {
    const status = await persistCoverJobError(
      song,
      new Error('FAL_KEY is not set'),
      posterLanded
    );
    return { ok: false, songId, status, reason: 'FAL_KEY is not set' };
  }

  try {
    const artist = await getArtistAdmin(song.artistId);
    const generation = await getLatestGeneration(song.id);
    const promptInput = {
      artistName: artist?.name,
      title: song.title,
      songPrompt: generationPromptText(generation),
      lyrics: generationLyricsText(generation),
      lore: artist?.lore,
      genres: artist?.styleDNA?.genres,
      moods: artist?.styleDNA?.moods,
      influences: artist?.styleDNA?.influences,
    };

    let coverProvider = song.coverProvider || null;

    if (posterLanded) {
      // Video-only retry: never re-run Flux once a poster URL exists.
      if (song.coverMotionStatus !== 'poster_ready' && song.coverMotionStatus !== 'ready') {
        await updateSongCoverFields(song.id, {
          coverMotionStatus: 'poster_ready',
        });
      }
    } else {
      await updateSongCoverFields(song.id, {
        coverMotionStatus: 'pending',
        coverMotionError: null,
      });
      const poster = await generateCoverPoster({
        prompt: buildCoverPosterPrompt(promptInput),
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
      });
      posterLanded = true;
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
    const status = await persistCoverJobError(song, error, posterLanded);
    return {
      ok: false,
      songId,
      status,
      reason: error instanceof Error ? error.message : 'Cover job failed',
    };
  }
}
