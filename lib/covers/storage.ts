/**
 * Rehost Fal cover assets to Firebase Storage.
 * Same Admin upload + download-token pattern as artist look uploads.
 */

import { randomUUID } from 'crypto';
import { getAdminBucket } from '@/lib/firebase/admin';

export const COVER_POSTER_OBJECT = 'poster.jpg';
export const COVER_LOOP_OBJECT = 'loop.mp4';

export async function downloadRemoteBytes(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download generated cover asset (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function uploadSongCoverObject(input: {
  songId: string;
  filename: typeof COVER_POSTER_OBJECT | typeof COVER_LOOP_OBJECT;
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  const bucket = getAdminBucket();
  if (!bucket.name) {
    throw new Error(
      'Storage bucket is not configured. Set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET or FIREBASE_STORAGE_BUCKET.'
    );
  }

  const objectPath = `songs/${input.songId}/cover/${input.filename}`;
  const downloadToken = randomUUID();
  await bucket.file(objectPath).save(input.buffer, {
    resumable: false,
    metadata: {
      contentType: input.contentType,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
  });

  const encodedPath = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;
}
