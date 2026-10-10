/** HttpOnly read cookie. Mutations must not accept it. The server route sets it. */
export const VIEWER_COOKIE = 'ss_viewer';

/** Firebase ID tokens last about an hour. Never keep the cookie longer than that. */
export const VIEWER_COOKIE_MAX_AGE = 60 * 60;

export function viewerTokenFromCookie(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const token = decodeURIComponent(raw).trim();
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Seconds the cookie may live. Uses the token's remaining lifetime, capped at
 * one hour. Missing or past `exp` yields 0 so the caller does not set a session.
 */
export function viewerCookieMaxAge(
  expSeconds: number | null | undefined,
  nowMs = Date.now()
): number {
  if (typeof expSeconds !== 'number' || !Number.isFinite(expSeconds)) return 0;
  const remaining = Math.floor(expSeconds - nowMs / 1000);
  if (remaining <= 0) return 0;
  return Math.min(remaining, VIEWER_COOKIE_MAX_AGE);
}

export function viewerCookieOptions(maxAge: number): {
  httpOnly: true;
  secure: true;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}
