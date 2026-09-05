import type { CoverMotionStatus } from '@/types/firestore';

export type CoverFields = {
  coverPosterUrl?: string | null;
  coverVideoUrl?: string | null;
  coverMotionStatus?: CoverMotionStatus | null;
  albumCoverPath?: string | null;
  albumCoverThumbnail?: string | null;
};

export function firstCoverUrl(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/** Flux poster first; albumCover* is a read fallback for songs without one. */
export function resolveCoverPoster(cover: CoverFields): string | null {
  return firstCoverUrl(
    cover.coverPosterUrl,
    cover.albumCoverThumbnail,
    cover.albumCoverPath
  );
}

/**
 * Loop only when the Fal job marked the cover ready and a video URL exists.
 * poster_ready / failed / pending / missing video → still only.
 */
export function resolveCoverVideo(cover: CoverFields): string | null {
  if (cover.coverMotionStatus !== 'ready') return null;
  return firstCoverUrl(cover.coverVideoUrl);
}

export function coverFieldsFromSong(song: CoverFields): CoverFields {
  return {
    coverPosterUrl: song.coverPosterUrl ?? null,
    coverVideoUrl: song.coverVideoUrl ?? null,
    coverMotionStatus: song.coverMotionStatus ?? null,
    albumCoverPath: song.albumCoverPath ?? null,
    albumCoverThumbnail: song.albumCoverThumbnail ?? null,
  };
}

export function playerCoverPayload(cover: CoverFields): CoverFields & {
  albumCoverUrl: string | null;
} {
  const fields = coverFieldsFromSong(cover);
  return {
    ...fields,
    albumCoverUrl: resolveCoverPoster(fields),
  };
}
