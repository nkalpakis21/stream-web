/**
 * Enqueue the Fal cover job without blocking the audio webhook path.
 * Uses waitUntil so Vercel can return 200 while Flux/Luma continue.
 */

import { waitUntil } from '@vercel/functions';
import { generateSongCover } from './generate';
import { isFalCoverPipeline } from './config';

export function enqueueSongCoverGeneration(songId: string): void {
  if (!isFalCoverPipeline() || !songId) {
    return;
  }

  waitUntil(
    generateSongCover(songId).catch(error => {
      console.error('[cover] detached job failed', songId, error);
    })
  );
}
