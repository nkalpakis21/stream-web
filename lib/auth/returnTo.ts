export const DEFAULT_AFTER_AUTH = '/discover';

/**
 * Only allow in-app relative paths. Reject protocol-relative, absolute,
 * and auth-page loops so return URLs cannot bounce or open-redirect.
 */
export function getSafeReturnTo(value: string | null | undefined): string {
  if (!value) return DEFAULT_AFTER_AUTH;
  if (!value.startsWith('/') || value.startsWith('//')) return DEFAULT_AFTER_AUTH;
  if (value.includes('\\') || value.includes('://')) return DEFAULT_AFTER_AUTH;

  const pathOnly = value.split('?')[0] ?? value;
  if (pathOnly === '/signin' || pathOnly === '/signup') {
    return DEFAULT_AFTER_AUTH;
  }

  return value;
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
