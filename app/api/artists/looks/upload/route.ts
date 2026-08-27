import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, HttpError, requireUserId } from '@/lib/api/requireAuth';
import { getAdminBucket, isFirebaseAdminConfigured } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function sniffImageType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * POST /api/artists/looks/upload
 * Multipart field `file`: framed JPEG (or other allowed image).
 * Stores under artist-looks/{uid}/{uuid}.jpg via Admin Storage and returns
 * an https download URL for avatarURL. Does not call Fal.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);

    if (!isFirebaseAdminConfigured()) {
      throw new HttpError(503, 'Photo upload is not configured (Firebase Admin).');
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!file || typeof file === 'string') {
      throw new HttpError(400, 'An image file is required.');
    }

    const type = (file.type || '').toLowerCase();
    if (type && !ALLOWED_TYPES.has(type)) {
      throw new HttpError(400, 'Please upload a JPEG, PNG, or WebP image.');
    }
    if (file.size <= 0) {
      throw new HttpError(400, 'That image is empty.');
    }
    if (file.size > MAX_BYTES) {
      throw new HttpError(400, 'Photo must be 4 MB or smaller.');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) {
      throw new HttpError(400, 'Photo must be 4 MB or smaller.');
    }

    const sniffed = sniffImageType(buffer);
    if (!sniffed) {
      throw new HttpError(400, 'Please upload a JPEG, PNG, or WebP image.');
    }

    let bucket;
    try {
      bucket = getAdminBucket();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (/bucket name not specified/i.test(message)) {
        throw new HttpError(
          503,
          'Storage bucket is not configured. Set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET or FIREBASE_STORAGE_BUCKET.'
        );
      }
      throw err;
    }
    if (!bucket.name) {
      throw new HttpError(
        503,
        'Storage bucket is not configured. Set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET or FIREBASE_STORAGE_BUCKET.'
      );
    }

    const objectPath = `artist-looks/${userId}/${randomUUID()}.jpg`;
    const downloadToken = randomUUID();
    const objectFile = bucket.file(objectPath);

    try {
      await objectFile.save(buffer, {
        resumable: false,
        metadata: {
          contentType: sniffed,
          cacheControl: 'public, max-age=31536000, immutable',
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
          },
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (/bucket name not specified/i.test(message)) {
        throw new HttpError(
          503,
          'Storage bucket is not configured. Set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET or FIREBASE_STORAGE_BUCKET.'
        );
      }
      throw err;
    }

    const encodedPath = encodeURIComponent(objectPath);
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;

    return NextResponse.json({ url });
  } catch (error) {
    return errorResponse(error);
  }
}
