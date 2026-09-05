/**
 * Legacy MusicGPT still writes onto albumCover*.
 * Gated when COVER_PIPELINE=fal or a Flux poster is already SoT.
 * Never overwrites existing albumCover* or Storage assets.
 */

import type { SongDocument } from '@/types/firestore';
import { shouldWriteMusicGptAlbumCover } from './config';

export type MusicGptAlbumCoverFields = Pick<
  SongDocument,
  'albumCoverPath' | 'albumCoverThumbnail'
>;

export function musicGptAlbumCoverSongUpdates(
  song: {
    coverPosterUrl?: string | null;
    albumCoverPath?: string | null;
    albumCoverThumbnail?: string | null;
  },
  incoming: {
    albumCoverPath?: string | null;
    albumCoverThumbnail?: string | null;
  }
): Partial<MusicGptAlbumCoverFields> {
  if (!shouldWriteMusicGptAlbumCover(song)) return {};

  const updates: Partial<MusicGptAlbumCoverFields> = {};
  const path = incoming.albumCoverPath?.trim();
  const thumb = incoming.albumCoverThumbnail?.trim();
  if (path && !song.albumCoverPath) {
    updates.albumCoverPath = path;
  }
  if (thumb && !song.albumCoverThumbnail) {
    updates.albumCoverThumbnail = thumb;
  }
  return updates;
}
