/**
 * Walk a queue until a track resolves to audio.
 * Missing and expired tracks are skipped. Returns null when none remain.
 */
export async function advanceToPlayable<T>(
  queue: readonly T[],
  start: number,
  direction: 1 | -1,
  resolve: (item: T) => Promise<string | null>
): Promise<{ index: number; audioUrl: string } | null> {
  let cursor = start;
  while (cursor >= 0 && cursor < queue.length) {
    const audioUrl = await resolve(queue[cursor]);
    if (audioUrl) return { index: cursor, audioUrl };
    cursor += direction;
  }
  return null;
}
