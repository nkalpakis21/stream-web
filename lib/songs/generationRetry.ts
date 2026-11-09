/**
 * Retry of a shell that is still waiting on MusicGPT.
 * A pending or processing task must not start a second paid job.
 * Resubmit only when the task is confirmed failed, or there is no task
 * and the song is older than GENERATION_RETRY_HARD_CAP_MS.
 */

export const GENERATION_RETRY_HARD_CAP_MS = 60 * 60 * 1000;

export type GenerationRunStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'missing';

export type SongRetryDecision = 'resubmit' | 'still_generating';

const FAILED = new Set(['failed', 'failure', 'error', 'errored', 'cancelled', 'canceled']);
const PENDING = new Set(['pending', 'queued', 'queue', 'submitted', 'created']);
const PROCESSING = new Set(['processing', 'running', 'in_progress', 'in-progress', 'generating']);
const COMPLETED = new Set(['completed', 'complete', 'success', 'succeeded', 'done']);

export function normalizeGenerationRunStatus(value: unknown): GenerationRunStatus | null {
  if (typeof value !== 'string') return null;
  const status = value.trim().toLowerCase();
  if (!status) return null;
  if (FAILED.has(status)) return 'failed';
  if (PENDING.has(status)) return 'pending';
  if (PROCESSING.has(status)) return 'processing';
  if (COMPLETED.has(status)) return 'completed';
  return null;
}

/** Read a MusicGPT byId conversion. Null when the payload has no usable status. */
export function readMusicGptRunStatus(
  conversion: Record<string, unknown> | null | undefined
): GenerationRunStatus | null {
  if (!conversion) return null;
  if (conversion.success === false || conversion.is_flagged === true) return 'failed';
  const named = normalizeGenerationRunStatus(
    conversion.status ?? conversion.conversion_status ?? conversion.state
  );
  if (named) return named;
  const path = conversion.conversion_path ?? conversion.audio_url ?? conversion.audioURL;
  if (typeof path === 'string' && path.trim()) return 'completed';
  return null;
}

export function decideSongRetry(input: {
  nowMs: number;
  createdAtMs: number;
  /** Our generation doc. `missing` when this song has no generation yet. */
  generationStatus: GenerationRunStatus;
  /** MusicGPT byId. Null when we could not ask, or the task id is absent. */
  providerStatus: GenerationRunStatus | null;
}): SongRetryDecision {
  const provider = input.providerStatus;
  const status =
    provider && provider !== 'missing' ? provider : input.generationStatus;

  if (status === 'pending' || status === 'processing' || status === 'completed') {
    return 'still_generating';
  }
  if (status === 'failed') return 'resubmit';
  if (input.nowMs - input.createdAtMs >= GENERATION_RETRY_HARD_CAP_MS) return 'resubmit';
  return 'still_generating';
}
