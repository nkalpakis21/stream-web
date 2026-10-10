/**
 * Pump.fun coin metadata ids. The id is the `{id}` in Storage object `c/{id}.json`
 * and in the public URI `https://www.streamstar.xyz/c/{id}`.
 * Callers must not treat a client-supplied path as that object.
 */

import {
  isValidPumpFunMetadataId,
  pumpFunMetadataObjectPath,
} from '@/lib/solana/pumpFun';

/** Id from a metadata URI (`/c/{id}`), or null. Raw storage paths are rejected. */
export function coinMetadataIdFromUri(uri: string): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;

  const match = parsed.pathname.match(/^\/c\/([0-9a-f]{32})(?:\.json)?$/);
  if (!match || !isValidPumpFunMetadataId(match[1])) return null;
  return match[1];
}

/**
 * Id returned by POST /api/artists/pump-fun/metadata.
 * Prefers `id` and otherwise derives it from `uri`.
 */
export function coinMetadataIdFromUpload(data: {
  id?: string | null;
  uri?: string | null;
}): string | null {
  const id = data.id?.trim() ?? '';
  if (isValidPumpFunMetadataId(id)) return id;
  const uri = data.uri?.trim() ?? '';
  return uri ? coinMetadataIdFromUri(uri) : null;
}

export function coinMetadataObjectPathForId(id: string): string | null {
  if (!isValidPumpFunMetadataId(id)) return null;
  return pumpFunMetadataObjectPath(id);
}

function cleanObjectPath(raw: string): string | null {
  if (!raw) return null;
  let path = raw;
  try {
    path = decodeURIComponent(raw.replace(/\+/g, '%20'));
  } catch {
    return null;
  }
  path = path.replace(/^\/+/, '');
  if (!path || path.includes('..') || path.includes('\\') || path.includes('\0')) return null;
  if (path.endsWith('/')) return null;
  return path;
}

/**
 * Object path when `url` points at `bucketName`. Otherwise null.
 * Only the two https forms our Admin bucket uses are accepted.
 * A raw object path is not a URL and is rejected.
 */
export function adminBucketObjectPath(url: string, bucketName: string): string | null {
  const bucket = bucketName.trim();
  const trimmed = url.trim();
  if (!bucket || !trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase();

  if (host === 'firebasestorage.googleapis.com') {
    const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!match) return null;
    let named: string;
    try {
      named = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
    if (named !== bucket) return null;
    return cleanObjectPath(match[2]);
  }

  if (host === 'storage.googleapis.com') {
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    let named: string;
    try {
      named = decodeURIComponent(parts[0]);
    } catch {
      return null;
    }
    if (named !== bucket) return null;
    return cleanObjectPath(parts.slice(1).join('/'));
  }

  return null;
}
