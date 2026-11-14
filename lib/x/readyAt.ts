/**
 * When the song first became playable. The MusicGPT webhook writes the
 * version's `createdAt` at the same moment it records `first_song_ready`.
 * Older songs fall back to the song's updatedAt, then createdAt.
 */
export function songAudioReadyAtMs(
  versions: ReadonlyArray<{ createdAtMs: number | null; hasAudio: boolean }>,
  fallbacks: ReadonlyArray<number | null | undefined> = []
): number | null {
  const withAudio = versions.filter(version => version.hasAudio);
  if (withAudio.length === 0) return null;
  const times = withAudio
    .map(version => version.createdAtMs)
    .filter((ms): ms is number => ms != null && Number.isFinite(ms));
  if (times.length > 0) return Math.min(...times);
  for (const value of fallbacks) {
    if (value != null && Number.isFinite(value)) return value;
  }
  return null;
}
