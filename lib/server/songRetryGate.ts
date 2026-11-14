import { adminGetSong, adminGetSongGenerations } from '@/lib/server/songsAdmin';
import { getConversionDataByTaskID } from '@/lib/ai/providers/musicgpt';
import {
  decideSongRetry,
  normalizeGenerationRunStatus,
  readMusicGptRunStatus,
  type GenerationRunStatus,
  type SongRetryDecision,
} from '@/lib/songs/generationRetry';
import type { GenerationDocument, SongDocument } from '@/types/firestore';

export interface SongRetryGateDeps {
  getSong?: (songId: string) => Promise<SongDocument | null>;
  listGenerations?: (songId: string) => Promise<GenerationDocument[]>;
  readProviderStatus?: (taskId: string) => Promise<GenerationRunStatus | null>;
  nowMs?: number;
}

function docStatus(generation: GenerationDocument | undefined): GenerationRunStatus {
  if (!generation) return 'missing';
  return normalizeGenerationRunStatus(generation.status) ?? 'pending';
}

/**
 * Before a paid MusicGPT create for an existing song.
 * Pending, processing, and completed tasks are left alone.
 * A confirmed failure can be resubmitted on the same song.
 * No task at all can be resubmitted only after the 60-minute hard cap.
 */
export async function gateSongGenerationRetry(
  songId: string,
  deps: SongRetryGateDeps = {}
): Promise<SongRetryDecision> {
  const song = await (deps.getSong ?? adminGetSong)(songId);
  if (!song || song.deletedAt || song.audioReady === true) return 'still_generating';

  const generations = await (deps.listGenerations ?? adminGetSongGenerations)(songId);
  const latest = generations[0];
  const taskId = typeof latest?.providerTaskId === 'string' ? latest.providerTaskId.trim() : '';
  let providerStatus: GenerationRunStatus | null = null;
  if (taskId) {
    if (deps.readProviderStatus) {
      providerStatus = await deps.readProviderStatus(taskId);
    } else {
      const remote = await getConversionDataByTaskID(taskId);
      providerStatus = remote?.conversion ? readMusicGptRunStatus(remote.conversion) : null;
    }
  }

  const createdAtMs =
    song.createdAt && typeof song.createdAt.toMillis === 'function' ? song.createdAt.toMillis() : 0;

  return decideSongRetry({
    nowMs: deps.nowMs ?? Date.now(),
    createdAtMs,
    generationStatus: docStatus(latest),
    providerStatus: taskId ? providerStatus : null,
  });
}
