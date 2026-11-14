/**
 * Clock for first_song_ready. elapsedMs is the time from the song's
 * createSubmittedAt (the create_submitted moment) to the first stored audio.
 */

import { timestampMillis } from '@/lib/server/funnel';

const MAX_ELAPSED_MS = 30 * 24 * 60 * 60 * 1000;

export function elapsedMsSinceSubmit(submittedAt: unknown, nowMs: number): number | null {
  const start = timestampMillis(submittedAt);
  if (start == null || !Number.isFinite(nowMs)) return null;
  const elapsed = Math.round(nowMs - start);
  if (!Number.isInteger(elapsed) || elapsed < 0 || elapsed > MAX_ELAPSED_MS) return null;
  return elapsed;
}

export function firstSongReadyProps(
  song: { id: string; artistId?: string | null; createSubmittedAt?: unknown },
  taskId: string,
  nowMs: number
): Record<string, unknown> {
  const elapsedMs = elapsedMsSinceSubmit(song.createSubmittedAt, nowMs);
  return {
    songId: song.id,
    taskId,
    ...(typeof song.artistId === 'string' && song.artistId ? { artistId: song.artistId } : {}),
    ...(elapsedMs != null ? { elapsedMs } : {}),
  };
}
