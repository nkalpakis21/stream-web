/**
 * Admin writes for Streamstar cover fields (`coverPosterUrl` / `coverVideoUrl`).
 * Does not dual-write albumCover* — those stay a read fallback for older songs.
 */

import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAdminDb } from '@/lib/firebase/admin';
import { firestoreNow } from '@/lib/x/artistStore';
import type {
  CoverMotionStatus,
  CoverProviderCrumbs,
  SongDocument,
} from '@/types/firestore';

export async function updateSongCoverFields(
  songId: string,
  fields: {
    coverPosterUrl?: string | null;
    coverVideoUrl?: string | null;
    coverMotionStatus?: CoverMotionStatus | null;
    coverMotionError?: string | null;
    coverProvider?: CoverProviderCrumbs | null;
  }
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: firestoreNow(),
    coverUpdatedAt: firestoreNow(),
  };

  if (fields.coverPosterUrl !== undefined) {
    payload.coverPosterUrl = fields.coverPosterUrl;
  }
  if (fields.coverVideoUrl !== undefined) {
    payload.coverVideoUrl = fields.coverVideoUrl;
  }
  if (fields.coverMotionStatus !== undefined) {
    payload.coverMotionStatus = fields.coverMotionStatus;
  }
  if (fields.coverMotionError !== undefined) {
    payload.coverMotionError = fields.coverMotionError;
  }
  if (fields.coverProvider !== undefined) {
    payload.coverProvider = fields.coverProvider;
  }

  await getAdminDb().collection(COLLECTIONS.songs).doc(songId).set(payload, {
    merge: true,
  });
}

export function mergeCoverProvider(
  current: SongDocument['coverProvider'],
  next: CoverProviderCrumbs
): CoverProviderCrumbs {
  return {
    ...(current || {}),
    ...next,
  };
}
