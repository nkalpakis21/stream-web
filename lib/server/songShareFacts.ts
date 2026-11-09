import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { publicArtistPhotoUrl } from '@/lib/artists/cardDisplay';
import { resolveCoverPoster } from '@/lib/covers/resolve';
import { playableAudioUrl } from '@/lib/songs/audioAvailability';
import {
  coverFaceVersionMs,
  sharePageGate,
  type SongShareFacts,
} from '@/lib/songs/shareCard';
import { adminGetSong, adminGetSongVersions } from '@/lib/server/songsAdmin';
import type { AIArtistDocument } from '@/types/firestore';

function timeMillis(value: unknown): number | null {
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof (value as { toMillis: unknown }).toMillis === 'function'
  ) {
    const ms = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

async function readFace(artistId: string): Promise<{
  name: string;
  photoUrl: string | null;
  updatedAtMs: number | null;
}> {
  const db = getAdminDb();
  const snap = await db.collection(COLLECTIONS.artists).doc(artistId).get();
  if (!snap.exists) return { name: 'Unknown Artist', photoUrl: null, updatedAtMs: null };
  const data = snap.data() as AIArtistDocument;
  const versionId = typeof data.currentVersionId === 'string' ? data.currentVersionId.trim() : '';
  let locked: unknown = null;
  let versionCreated: number | null = null;
  if (versionId) {
    const version = await db.collection(COLLECTIONS.artistVersions).doc(versionId).get();
    if (version.exists) {
      locked = version.get('avatarURL');
      versionCreated = timeMillis(version.get('createdAt'));
    }
  }
  const photoUrl = data.deletedAt ? null : publicArtistPhotoUrl(locked, data.avatarURL);
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Unknown Artist';
  const updatedAtMs = photoUrl
    ? Math.max(timeMillis(data.updatedAt) ?? 0, versionCreated ?? 0) || null
    : null;
  return { name, photoUrl, updatedAtMs };
}

/**
 * Public card facts for /songs/[id]. Private and deleted songs stop before
 * artist art is read, so a hidden title never reaches the image.
 */
export async function loadSongShareFacts(
  songId: string,
  viewerId: string | null
): Promise<SongShareFacts> {
  const song = await adminGetSong(songId);
  const gate = sharePageGate(song, viewerId);
  if (gate !== 'public' || !song) return { gate: gate === 'public' ? 'not-found' : gate };
  const [versions, face] = await Promise.all([
    adminGetSongVersions(song.id || songId),
    song.artistId ? readFace(song.artistId) : Promise.resolve(null),
  ]);
  const audioReady = playableAudioUrl(versions) != null;
  const coverUrl = resolveCoverPoster(song);
  const faceUrl = face?.photoUrl ?? null;
  return {
    gate: 'public',
    songId: song.id || songId,
    title: typeof song.title === 'string' ? song.title : 'Untitled',
    artistName: face?.name || 'Unknown Artist',
    audioReady,
    coverUrl,
    faceUrl,
    versionMs: coverFaceVersionMs({
      coverUrl,
      coverUpdatedAtMs: timeMillis(song.coverUpdatedAt),
      songUpdatedAtMs: timeMillis(song.updatedAt),
      faceUrl,
      faceUpdatedAtMs: face?.updatedAtMs ?? null,
    }),
  };
}
