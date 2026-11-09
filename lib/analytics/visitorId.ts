/**
 * Anonymous id for share-page plays.
 * A random UUID in a first-party cookie and localStorage. No fingerprint.
 * The cookie lasts about a year.
 */

export const VISITOR_COOKIE = 'ss_visitor';
export const VISITOR_STORAGE_KEY = 'ss_visitor';
export const VISITOR_ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const VISITOR_ID = /^ssv_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function canonicalVisitorId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return VISITOR_ID.test(trimmed) ? trimmed : null;
}

export function createVisitorId(): string {
  return `ssv_${crypto.randomUUID()}`;
}

export function visitorCookie(id: string, secure: boolean): string {
  const parts = [
    `${VISITOR_COOKIE}=${id}`,
    'Path=/',
    `Max-Age=${VISITOR_ID_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function readCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const [name, ...rest] = part.trim().split('=');
    if (name === VISITOR_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function writeCookie(id: string): void {
  if (typeof document === 'undefined') return;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:';
  document.cookie = visitorCookie(id, secure);
}

function readStorage(): string | null {
  try {
    return localStorage.getItem(VISITOR_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(id: string): void {
  try {
    localStorage.setItem(VISITOR_STORAGE_KEY, id);
  } catch {
    // Private mode can reject storage. The cookie still holds the id.
  }
}

/** Read the saved id or mint one. Returns null outside the browser. */
export function readOrCreateVisitorId(): string | null {
  if (typeof window === 'undefined') return null;
  const existing = canonicalVisitorId(readCookie()) ?? canonicalVisitorId(readStorage());
  const id = existing ?? createVisitorId();
  writeCookie(id);
  writeStorage(id);
  return id;
}
