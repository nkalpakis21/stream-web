/**
 * Cover SafeSearch decisions and what a viewer is allowed to see.
 * COVER_MODERATION_ENABLED is read only here. Only the string `true` turns
 * moderation on. Any other value, including unset, keeps today's covers.
 */

import { getInitials } from '@/lib/utils/avatar';
import { coverFieldsFromSong, type CoverFields } from '@/lib/covers/resolve';

export type CoverModerationStatus = 'pending' | 'passed' | 'flagged' | 'error';

export interface SafeSearchLabels {
  adult?: string | null;
  violence?: string | null;
  racy?: string | null;
}

const FLAG_LIKELIHOODS = new Set(['LIKELY', 'VERY_LIKELY']);

export function isCoverModerationEnabled(
  raw: string | undefined = process.env.COVER_MODERATION_ENABLED
): boolean {
  return raw === 'true';
}

export function readCoverModerationStatus(
  song: { coverModeration?: { status?: unknown } | null } | null | undefined
): CoverModerationStatus | null {
  const status = song?.coverModeration?.status;
  if (status === 'pending' || status === 'passed' || status === 'flagged' || status === 'error') {
    return status;
  }
  return null;
}

/** Adult, violence, or racy at LIKELY or VERY_LIKELY. POSSIBLE and below pass. */
export function safeSearchDecision(labels: SafeSearchLabels | null | undefined): 'flagged' | 'passed' {
  if (!labels) return 'passed';
  for (const value of [labels.adult, labels.violence, labels.racy]) {
    if (typeof value !== 'string') continue;
    if (FLAG_LIKELIHOODS.has(value.trim().toUpperCase())) return 'flagged';
  }
  return 'passed';
}

export function coverModerationRetryable(status: CoverModerationStatus | null | undefined): boolean {
  return status === 'error' || status === 'pending';
}

/** Flag off shows the stored cover. Flag on shows it only after a pass. */
export function coverIsPublic(
  song: { coverModeration?: { status?: unknown } | null } | null | undefined,
  enabled: boolean
): boolean {
  if (!enabled) return true;
  return readCoverModerationStatus(song) === 'passed';
}

type CoverSong = CoverFields & { coverModeration?: { status?: unknown } | null };

/** Drop a cover that is not public so it cannot be used as a face fallback. */
export function withPublicSongCover<T extends CoverSong>(song: T, enabled: boolean): T {
  if (coverIsPublic(song, enabled)) return song;
  return {
    ...song,
    coverPosterUrl: null,
    coverVideoUrl: null,
    coverMotionStatus: null,
    albumCoverPath: null,
    albumCoverThumbnail: null,
  };
}

export interface CoverOwnerNotice {
  status: 'flagged' | 'error';
  message: string;
  action: 'replace' | 'retry';
  buttonLabel: string;
}

function artistLabel(name: string | null | undefined): string {
  const clean = (name ?? '').replace(/\s+/g, ' ').trim();
  return clean || 'the artist';
}

/** Owner copy. Fans never receive this. Pending and passed have no note. */
export function coverOwnerNotice(
  status: CoverModerationStatus | null | undefined,
  artistName: string | null | undefined
): CoverOwnerNotice | null {
  if (status === 'flagged') {
    return {
      status,
      message: `This cover can't be shown publicly, so we're using ${artistLabel(artistName)}'s face.`,
      action: 'replace',
      buttonLabel: 'Try another cover',
    };
  }
  if (status === 'error') {
    return {
      status,
      message: "We couldn't check this cover yet.",
      action: 'retry',
      buttonLabel: 'Try again',
    };
  }
  return null;
}

export interface VisibleCover {
  fields: CoverFields;
  /** True when the slot is the artist face or initials, not the song cover. */
  fallback: boolean;
  /** Initials fill the slot when moderation hides the cover and there is no face. */
  initials: string | null;
  notice: CoverOwnerNotice | null;
}

/**
 * What to paint in a cover slot.
 * Flag off: the stored cover, no note.
 * Flag on: the cover only when status is passed. Otherwise the face, or initials.
 */
export function resolveVisibleCover(
  song: CoverSong | null | undefined,
  options: {
    enabled: boolean;
    faceUrl?: string | null;
    artistName?: string | null;
  }
): VisibleCover {
  const source = song ?? {};
  const status = readCoverModerationStatus(source);
  if (!options.enabled || status === 'passed') {
    return {
      fields: coverFieldsFromSong(source),
      fallback: false,
      initials: null,
      notice: null,
    };
  }
  const face = options.faceUrl?.trim() || null;
  const name = (options.artistName ?? '').replace(/\s+/g, ' ').trim();
  return {
    fields: {
      coverPosterUrl: face,
      coverVideoUrl: null,
      coverMotionStatus: null,
      albumCoverPath: null,
      albumCoverThumbnail: null,
    },
    fallback: true,
    initials: face ? null : getInitials(name || 'Artist'),
    notice: coverOwnerNotice(status, options.artistName),
  };
}

/**
 * Status to store on the owner tile after a moderation request.
 * A failed call returns null so the note that was already on screen stays.
 * Replace does not treat a pass as a local status: the new image arrives on refresh.
 */
export function ownerNoticeStatusAfterCall(
  action: 'retry' | 'replace',
  responseOk: boolean,
  status: unknown
): CoverModerationStatus | null {
  if (!responseOk) return null;
  if (
    action === 'retry' &&
    (status === 'pending' || status === 'passed' || status === 'flagged' || status === 'error')
  ) {
    return status;
  }
  if (action === 'replace' && (status === 'flagged' || status === 'error')) {
    return status;
  }
  return null;
}

export function canModerateSongCover(userId: string, ownerId: string, isAdmin: boolean): boolean {
  if (!userId) return false;
  return userId === ownerId || isAdmin;
}
