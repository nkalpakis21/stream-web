/**
 * Copy a MusicGPT conversion MP3 into Firebase Storage.
 * Download URLs match lib/covers/storage.ts: Admin upload plus a
 * firebaseStorageDownloadTokens query token. No Storage rules change.
 */

import { createHash, randomUUID } from 'crypto';
import { getAdminBucket } from '@/lib/firebase/admin';
import {
  classifyAudioHttpStatus,
  isOurStorageAudioUrl,
  type AudioProbeClass,
} from '@/lib/server/songAudioUrl';

export const AUDIO_CONTENT_TYPE = 'audio/mpeg';
/** A finished MusicGPT song is a few megabytes. Refuse anything larger. */
export const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 45_000;

export type PersistAudioResult = {
  audioURL: string;
  musicgptAudioUrl: string;
  audioPersisted: boolean;
  httpStatus: number;
  reason: AudioProbeClass;
};

type FileMetadata = {
  metadata?: Record<string, string> | null;
};

export type SongAudioFile = {
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[FileMetadata]>;
  save(
    data: Buffer,
    options: {
      resumable?: boolean;
      metadata?: {
        contentType?: string;
        cacheControl?: string;
        metadata?: Record<string, string>;
      };
    }
  ): Promise<unknown>;
  setMetadata(metadata: {
    metadata?: Record<string, string>;
  }): Promise<unknown>;
};

export type SongAudioBucket = {
  name: string;
  file(objectPath: string): SongAudioFile;
};

type StorageDeps = {
  bucket?: SongAudioBucket;
  fetchImpl?: typeof fetch;
};

let testDeps: StorageDeps | null = null;

export function setSongAudioStorageDepsForTests(deps: StorageDeps | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setSongAudioStorageDepsForTests is disabled in production');
  }
  testDeps = deps;
}

export function songAudioObjectPath(songId: string, conversionId: string): string {
  return `songs/${storageId(songId)}/audio/${storageId(conversionId)}.mp3`;
}

export function firebaseAudioDownloadUrl(
  bucketName: string,
  objectPath: string,
  downloadToken: string
): string {
  const encodedPath = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;
}

function storageId(value: string): string {
  const trimmed = value.trim();
  if (/^[A-Za-z0-9_-]{1,128}$/.test(trimmed)) return trimmed;
  const digest = createHash('sha256').update(trimmed).digest('hex').slice(0, 32);
  return `id-${digest}`;
}

function tokenFromMetadata(metadata: FileMetadata | undefined): string | null {
  const raw = metadata?.metadata?.firebaseStorageDownloadTokens;
  if (typeof raw !== 'string') return null;
  const token = raw.split(',')[0]?.trim();
  return token || null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'invalid-url';
  }
}

function isBlockedDownloadHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }
  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
    return true;
  }
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const parts = match.slice(1).map((part) => Number(part));
  if (parts.some((part) => part > 255)) return true;
  const a = parts[0] ?? 0;
  const b = parts[1] ?? 0;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function fallback(
  sourceUrl: string,
  httpStatus: number,
  reason: AudioProbeClass,
  message: string,
  songId: string,
  conversionId: string
): PersistAudioResult {
  console.error(
    `song_audio_persist_failed song=${songId} conversion=${conversionId} status=${httpStatus} reason=${reason} host=${hostOf(sourceUrl)} ${message}`
  );
  return {
    audioURL: sourceUrl,
    musicgptAudioUrl: sourceUrl,
    audioPersisted: false,
    httpStatus,
    reason,
  };
}

function resolveBucket(explicit?: SongAudioBucket): { bucket: SongAudioBucket | null; message: string } {
  if (explicit?.name) return { bucket: explicit, message: '' };
  if (testDeps?.bucket?.name) return { bucket: testDeps.bucket, message: '' };
  try {
    const bucket = getAdminBucket();
    if (!bucket.name) return { bucket: null, message: 'storage bucket is not configured' };
    return { bucket: bucket as unknown as SongAudioBucket, message: '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { bucket: null, message };
  }
}

function resolveFetch(explicit?: typeof fetch): typeof fetch {
  return explicit ?? testDeps?.fetchImpl ?? fetch;
}

async function readExistingUrl(bucket: SongAudioBucket, objectPath: string): Promise<string | null> {
  const file = bucket.file(objectPath);
  let present = false;
  try {
    const [exists] = await file.exists();
    present = exists;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`storage exists check failed: ${message}`);
  }
  if (!present) return null;

  let token: string | null = null;
  try {
    const [metadata] = await file.getMetadata();
    token = tokenFromMetadata(metadata);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === 404 || code === '404') return null;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`storage metadata read failed: ${message}`);
  }

  if (!token) {
    token = randomUUID();
    await file.setMetadata({
      metadata: { firebaseStorageDownloadTokens: token },
    });
  }
  return firebaseAudioDownloadUrl(bucket.name, objectPath, token);
}

async function downloadMp3(
  url: string,
  fetchImpl: typeof fetch
): Promise<{ ok: true; bytes: Buffer } | { ok: false; httpStatus: number; reason: AudioProbeClass; message: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, httpStatus: 0, reason: 'failed', message: 'conversion_path is not a URL' };
  }
  if (parsed.protocol !== 'https:' || isBlockedDownloadHost(parsed.hostname)) {
    return { ok: false, httpStatus: 0, reason: 'failed', message: 'conversion_path is not a public https URL' };
  }

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, httpStatus: 0, reason: 'failed', message };
  }

  const httpStatus = response.status;
  if (!response.ok) {
    try {
      await response.body?.cancel();
    } catch {
      // The status is what the caller needs.
    }
    return {
      ok: false,
      httpStatus,
      reason: classifyAudioHttpStatus(httpStatus),
      message: `download failed (${httpStatus})`,
    };
  }

  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES) {
    try {
      await response.body?.cancel();
    } catch {
      // Refusing the body is the point.
    }
    return { ok: false, httpStatus, reason: 'failed', message: 'audio exceeds size cap' };
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    return { ok: false, httpStatus, reason: 'failed', message: 'audio body was empty' };
  }
  if (bytes.length > MAX_AUDIO_BYTES) {
    return { ok: false, httpStatus, reason: 'failed', message: 'audio exceeds size cap' };
  }
  return { ok: true, bytes };
}

/**
 * Download conversion_path and store it at songs/{songId}/audio/{conversionId}.mp3.
 * A retry that finds the object reuses its download token and does not upload again.
 * Any failure returns the original URL with audioPersisted false.
 */
export async function persistConversionAudio(input: {
  songId: string;
  conversionId: string;
  sourceUrl: string;
  bucket?: SongAudioBucket;
  fetchImpl?: typeof fetch;
}): Promise<PersistAudioResult> {
  const sourceUrl = input.sourceUrl.trim();
  const songId = input.songId;
  const conversionId = input.conversionId;
  if (!sourceUrl) {
    return fallback(sourceUrl, 0, 'failed', 'missing conversion_path', songId, conversionId);
  }

  const resolved = resolveBucket(input.bucket);
  const bucket = resolved.bucket;
  if (!bucket) {
    return fallback(
      sourceUrl,
      0,
      'failed',
      resolved.message || 'storage bucket is not configured',
      songId,
      conversionId
    );
  }

  if (isOurStorageAudioUrl(sourceUrl, bucket.name)) {
    return {
      audioURL: sourceUrl,
      musicgptAudioUrl: sourceUrl,
      audioPersisted: true,
      httpStatus: 200,
      reason: 'ok',
    };
  }

  const objectPath = songAudioObjectPath(songId, conversionId);
  try {
    const existing = await readExistingUrl(bucket, objectPath);
    if (existing) {
      return {
        audioURL: existing,
        musicgptAudioUrl: sourceUrl,
        audioPersisted: true,
        httpStatus: 200,
        reason: 'ok',
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fallback(sourceUrl, 0, 'failed', message, songId, conversionId);
  }

  const downloaded = await downloadMp3(sourceUrl, resolveFetch(input.fetchImpl));
  if (!downloaded.ok) {
    return fallback(
      sourceUrl,
      downloaded.httpStatus,
      downloaded.reason,
      downloaded.message,
      songId,
      conversionId
    );
  }

  const downloadToken = randomUUID();
  try {
    await bucket.file(objectPath).save(downloaded.bytes, {
      resumable: false,
      metadata: {
        contentType: AUDIO_CONTENT_TYPE,
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });
    const stored = (await readExistingUrl(bucket, objectPath)) ??
      firebaseAudioDownloadUrl(bucket.name, objectPath, downloadToken);
    return {
      audioURL: stored,
      musicgptAudioUrl: sourceUrl,
      audioPersisted: true,
      httpStatus: 200,
      reason: 'ok',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fallback(sourceUrl, 0, 'failed', message, songId, conversionId);
  }
}

async function responseStatus(
  url: string,
  method: 'HEAD' | 'GET',
  fetchImpl: typeof fetch
): Promise<number> {
  const response = await fetchImpl(url, {
    method,
    redirect: 'follow',
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  try {
    await response.body?.cancel();
  } catch {
    // Status was already captured.
  }
  return response.status;
}

/**
 * Dry-run reachability check. HEAD first. GET only when HEAD is not 2xx,
 * so a CDN that rejects HEAD is not reported as expired.
 */
export async function probeRemoteAudio(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ httpStatus: number; reason: AudioProbeClass }> {
  let headStatus: number | null = null;
  try {
    headStatus = await responseStatus(url, 'HEAD', fetchImpl);
  } catch {
    headStatus = null;
  }
  if (headStatus != null && classifyAudioHttpStatus(headStatus) === 'ok') {
    return { httpStatus: headStatus, reason: 'ok' };
  }

  try {
    const getStatus = await responseStatus(url, 'GET', fetchImpl);
    return { httpStatus: getStatus, reason: classifyAudioHttpStatus(getStatus) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (headStatus == null) {
      console.error(`song_audio_probe_failed host=${hostOf(url)} ${message}`);
      return { httpStatus: 0, reason: 'failed' };
    }
    return { httpStatus: headStatus, reason: classifyAudioHttpStatus(headStatus) };
  }
}
