import { HttpError } from '@/lib/api/requireAuth';
import type { FunnelPlatform } from '@/lib/funnel/platform';
import { trackFunnelEvent } from '@/lib/server/funnel';
import {
  adminGetSong,
  adminGetSongGenerations,
  adminGetSongVersions,
  adminSetPrimarySongVersion,
} from '@/lib/server/songsAdmin';
import {
  changedFromDefault,
  generationTakeInput,
  takeAudioUrl,
  takeNumberForConversion,
  takeSeedFromParts,
  type TakeNumber,
} from '@/lib/songs/takes';

const MAX_MS_TO_PICK = 30 * 24 * 60 * 60 * 1000;

type TokenVerifier = (idToken: string) => Promise<{ uid: string }>;

let verifyForTests: TokenVerifier | null = null;

/** Test-only. Production requests always use Firebase Admin verifyIdToken. */
export function setSongTakeAuthForTests(verify: TokenVerifier | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setSongTakeAuthForTests is disabled in production');
  }
  verifyForTests = verify;
}

export function songTakeAuthVerifier(): TokenVerifier | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  return verifyForTests ?? undefined;
}

export function readTakeSwitchBody(body: unknown): { versionId: string; msToPick: number | null } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Invalid take');
  }
  const record = body as Record<string, unknown>;
  if (typeof record.versionId !== 'string') {
    throw new HttpError(400, 'versionId is required');
  }
  const versionId = record.versionId.trim();
  if (!versionId || versionId.length > 128 || versionId.includes('/')) {
    throw new HttpError(400, 'versionId is invalid');
  }
  let msToPick: number | null = null;
  if (record.msToPick != null) {
    if (
      typeof record.msToPick !== 'number' ||
      !Number.isInteger(record.msToPick) ||
      record.msToPick < 0 ||
      record.msToPick > MAX_MS_TO_PICK
    ) {
      throw new HttpError(400, 'msToPick is invalid');
    }
    msToPick = record.msToPick;
  }
  return { versionId, msToPick };
}

/**
 * Owner-only switch. Admin SDK writes currentVersionId, updatedAt, and
 * isPrimary. Title, cover, link, plays, and shares stay on the song.
 * Take 1 is the default, so choosing it sets changedFromDefault false.
 */
export async function switchSongTake(input: {
  songId: string;
  ownerId: string;
  versionId: string;
  msToPick: number | null;
  platform: FunnelPlatform;
}): Promise<{ take: TakeNumber; unchanged: boolean }> {
  const songId = input.songId.trim();
  if (!songId) throw new HttpError(400, 'Song not found');
  const song = await adminGetSong(songId);
  if (!song || song.deletedAt) throw new HttpError(404, 'Song not found');
  if (song.ownerId !== input.ownerId) {
    throw new HttpError(403, 'Only the owner can switch takes');
  }

  const [versions, generations] = await Promise.all([
    adminGetSongVersions(songId),
    adminGetSongGenerations(songId),
  ]);
  const version = versions.find((item) => item.id === input.versionId);
  if (!version || version.songId !== songId || !takeAudioUrl(version)) {
    throw new HttpError(400, 'That version is not a take');
  }
  const seed = takeSeedFromParts({
    currentVersionId: song.currentVersionId,
    versions,
    generations: generations.map((generation) => generationTakeInput(generation)),
  });
  const take = seed
    ? takeNumberForConversion(seed.conversionIds, version.providerOutputId)
    : null;
  if (!take) throw new HttpError(400, 'That version is not a take');

  if (song.currentVersionId === version.id) {
    return { take, unchanged: true };
  }

  await adminSetPrimarySongVersion(songId, version.id);
  try {
    await trackFunnelEvent(
      input.ownerId,
      'take_picked',
      {
        songId,
        artistId: song.artistId,
        take,
        changedFromDefault: changedFromDefault(take),
        ...(input.msToPick != null ? { msToPick: input.msToPick } : {}),
      },
      input.platform
    );
  } catch (error) {
    console.error('[funnel] take_picked', error instanceof Error ? error.message : 'failed');
  }
  return { take, unchanged: false };
}
