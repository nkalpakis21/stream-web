import { SITE_WWW_ORIGIN } from '@/lib/brand/site';

export const DEFAULT_AFTER_AUTH = '/discover';

/** Tabs, newlines, and other controls are stripped by browsers into an open redirect. */
const CONTROL_CHARS = /[\x00-\x1F\x7F]/;

function returnToOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return SITE_WWW_ORIGIN;
}

/**
 * Only allow in-app relative paths. Reject protocol-relative, absolute,
 * control characters, and auth-page loops. Keep the path and query the
 * visitor asked for, including Studio, so sign-in returns them there.
 */
export function getSafeReturnTo(value: string | null | undefined): string {
  if (!value) return DEFAULT_AFTER_AUTH;
  if (CONTROL_CHARS.test(value)) return DEFAULT_AFTER_AUTH;

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return DEFAULT_AFTER_AUTH;
  }
  if (CONTROL_CHARS.test(decoded)) return DEFAULT_AFTER_AUTH;
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return DEFAULT_AFTER_AUTH;
  if (decoded.includes('\\') || decoded.includes('://')) return DEFAULT_AFTER_AUTH;

  const origin = returnToOrigin();
  let parsed: URL;
  try {
    parsed = new URL(decoded, origin);
  } catch {
    return DEFAULT_AFTER_AUTH;
  }
  if (parsed.origin !== origin) return DEFAULT_AFTER_AUTH;
  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (CONTROL_CHARS.test(path)) return DEFAULT_AFTER_AUTH;

  if (parsed.pathname === '/signin' || parsed.pathname === '/signup') {
    return DEFAULT_AFTER_AUTH;
  }

  return path;
}

export function currentReturnTo(pathname: string, search?: string | null): string {
  if (!pathname) return DEFAULT_AFTER_AUTH;
  const qs =
    search && search !== '?'
      ? search.startsWith('?')
        ? search
        : `?${search}`
      : '';
  return `${pathname}${qs}`;
}

export function authHref(
  path: '/signin' | '/signup',
  returnTo?: string | null
): string {
  if (!returnTo) return path;
  const next = getSafeReturnTo(returnTo);
  return `${path}?next=${encodeURIComponent(next)}`;
}
