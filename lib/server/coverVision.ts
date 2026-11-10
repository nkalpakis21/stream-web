/**
 * Cloud Vision SafeSearch via images:annotate.
 * Auth is the Firebase Admin credential already used server-side
 * (service-account access token). No extra env var.
 * Callers must fail closed when this throws.
 */

import * as admin from 'firebase-admin';
import { isFirebaseAdminConfigured } from '@/lib/firebase/admin';
import type { SafeSearchLabels } from '@/lib/covers/moderation';

export type VisionSafeSearchClient = (input: { imageUrl: string }) => Promise<SafeSearchLabels>;

let visionOverride: VisionSafeSearchClient | null = null;

/** Test-only. Production ignores attempts to swap the client. */
export function setVisionSafeSearchClientForTests(client: VisionSafeSearchClient | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setVisionSafeSearchClientForTests is disabled in production');
  }
  visionOverride = client;
}

async function visionAccessToken(): Promise<string> {
  if (!isFirebaseAdminConfigured()) {
    throw new Error('Firebase Admin is not initialized');
  }
  const credential = admin.app().options.credential;
  if (!credential) {
    throw new Error('Firebase Admin credential is missing');
  }
  const token = await credential.getAccessToken();
  const access = token?.access_token?.trim();
  if (!access) {
    throw new Error('Vision access token is missing');
  }
  return access;
}

function labelOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * SAFE_SEARCH_DETECTION for one https image.
 * Throws on transport errors, API errors, and a missing annotation
 * so the caller can store status `error` and keep the cover off the public slot.
 */
export async function annotateSafeSearch(imageUrl: string): Promise<SafeSearchLabels> {
  if (visionOverride) {
    return visionOverride({ imageUrl });
  }
  const url = imageUrl.trim();
  if (!url.startsWith('https://')) {
    throw new Error('Cover URL is not an https image');
  }
  const accessToken = await visionAccessToken();
  const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          image: { source: { imageUri: url } },
          features: [{ type: 'SAFE_SEARCH_DETECTION' }],
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Vision images:annotate failed (${response.status})`);
  }
  const body = (await response.json()) as {
    responses?: Array<{
      error?: { message?: string };
      safeSearchAnnotation?: {
        adult?: string;
        violence?: string;
        racy?: string;
      };
    }>;
  };
  const first = body.responses?.[0];
  if (first?.error) {
    throw new Error(first.error.message || 'Vision SafeSearch error');
  }
  const annotation = first?.safeSearchAnnotation;
  if (!annotation) {
    throw new Error('Vision SafeSearch annotation missing');
  }
  return {
    adult: labelOf(annotation.adult),
    violence: labelOf(annotation.violence),
    racy: labelOf(annotation.racy),
  };
}
