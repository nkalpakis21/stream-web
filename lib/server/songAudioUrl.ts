/**
 * Host checks for song audio.
 * Playback URLs we own are Firebase Storage download URLs (same shapes as
 * account-deletion path parsing). MusicGPT MP3s live on musicgpt.com and the
 * older lalals S3 hosts and expire.
 */

import { firebaseStorageObjectPath } from '@/lib/server/deleteAccount';

const MUSICGPT_HOST_SUFFIXES = ['musicgpt.com', 'lalals.com'] as const;

export type AudioProbeClass = 'ok' | 'not_found' | 'forbidden' | 'other' | 'failed';

function hostnameOf(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hostMatches(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

/** MusicGPT / lalals download hosts. Our Storage bucket is never one of these. */
export function isMusicGptAudioUrl(url: string): boolean {
  const host = hostnameOf(url);
  if (!host) return false;
  if (host.includes('lalals.s3')) return true;
  return MUSICGPT_HOST_SUFFIXES.some((suffix) => hostMatches(host, suffix));
}

/**
 * True when the URL addresses an object in this Firebase Storage bucket.
 * Matches the tokenized download URL covers use, plus storage.googleapis.com
 * and gs:// for the same bucket.
 */
export function isOurStorageAudioUrl(url: string, bucketName: string): boolean {
  const bucket = bucketName.trim();
  const trimmed = url.trim();
  if (!bucket || !trimmed) return false;
  if (firebaseStorageObjectPath(trimmed, bucket)) return true;

  if (trimmed.toLowerCase().startsWith('gs://')) {
    const rest = trimmed.slice('gs://'.length);
    const slash = rest.indexOf('/');
    if (slash <= 0) return false;
    return rest.slice(0, slash) === bucket;
  }
  return false;
}

/** A playable URL that still points at MusicGPT rather than our bucket. */
export function audioPointsAtMusicGpt(url: string, bucketName: string): boolean {
  if (!url || isOurStorageAudioUrl(url, bucketName)) return false;
  return isMusicGptAudioUrl(url);
}

/**
 * 2xx is fetchable. 404/410 are gone. 401/403 are forbidden.
 * Other 4xx are unfetchable. 5xx and network failures stay retryable.
 */
export function classifyAudioHttpStatus(status: number): AudioProbeClass {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 404 || status === 410) return 'not_found';
  if (status === 401 || status === 403) return 'forbidden';
  if (status >= 400 && status < 500) return 'other';
  return 'failed';
}
