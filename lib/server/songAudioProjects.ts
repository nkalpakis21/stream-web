/**
 * Firebase projects the song-audio backfill is allowed to target.
 * Buckets match the Vercel FIREBASE_STORAGE_BUCKET values.
 * The service account project_id must match before any read or upload.
 */

export const SONG_AUDIO_PROJECTS = {
  'stream-dev': {
    projectId: 'stream-dev-48098',
    bucket: 'stream-dev-48098.firebasestorage.app',
  },
  'stream-prod': {
    projectId: 'stream-prod-864df',
    bucket: 'stream-prod-864df.firebasestorage.app',
  },
} as const;

export type SongAudioProjectName = keyof typeof SONG_AUDIO_PROJECTS;

export function resolveSongAudioProject(raw: string): SongAudioProjectName | null {
  const name = raw.trim().toLowerCase();
  if (name === 'stream-dev' || name === 'dev' || name === 'stream-dev-48098') {
    return 'stream-dev';
  }
  if (
    name === 'stream-prod' ||
    name === 'prod' ||
    name === 'production' ||
    name === 'stream-prod-864df'
  ) {
    return 'stream-prod';
  }
  return null;
}
