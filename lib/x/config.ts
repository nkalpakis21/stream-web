/**
 * X (Twitter) OAuth 2.0 user-context config for Streamstar artists.
 *
 * Env (server-only; never NEXT_PUBLIC):
 *   X_CLIENT_ID
 *   X_CLIENT_SECRET
 *
 * If unset, Connect X is disabled. Do not invent keys and do not fake posts.
 * Same pattern as FAL_KEY.
 */

export const X_SCOPES = [
  // Required by the product brief.
  'tweet.write',
  'users.read',
  'offline.access',
  // X requires tweet.read alongside tweet.write for user-context posting.
  'tweet.read',
  // Cover image on song-live posts (v2 media upload).
  'media.write',
  // Name/bio/avatar sync on connect. Harmless if the app's portal
  // permissions do not include profile writes — sync then no-ops.
  'users.write',
].join(' ');

export const X_AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize';
export const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token';
export const X_REVOKE_URL = 'https://api.x.com/2/oauth2/revoke';
export const X_API_BASE = 'https://api.x.com/2';

export const X_CLIENT_ID_MISSING_MESSAGE =
  'X is not configured. Set the X_CLIENT_ID and X_CLIENT_SECRET env vars to enable Connect X. The artist can still be created without an X account.';

export function isXConfigured(): boolean {
  return Boolean(
    process.env.X_CLIENT_ID?.trim() && process.env.X_CLIENT_SECRET?.trim()
  );
}

export function getXClientId(): string {
  const value = process.env.X_CLIENT_ID?.trim();
  if (!value) {
    throw new Error(X_CLIENT_ID_MISSING_MESSAGE);
  }
  return value;
}

export function getXClientSecret(): string {
  const value = process.env.X_CLIENT_SECRET?.trim();
  if (!value) {
    throw new Error(X_CLIENT_ID_MISSING_MESSAGE);
  }
  return value;
}

/**
 * OAuth callback URL. Must match a URL registered on the X app exactly.
 *
 * Register these on the X developer portal:
 *   https://streamstar.xyz/api/x/callback
 *   https://www.streamstar.xyz/api/x/callback
 *   https://stream-web-git-develop-nkalpakis.vercel.app/api/x/callback
 *   http://localhost:3000/api/x/callback
 *
 * Optional override: X_REDIRECT_URI (full callback URL).
 */
export function getXCallbackUrl(requestUrl?: string): string {
  const explicit = process.env.X_REDIRECT_URI?.trim();
  if (explicit) return explicit;

  if (requestUrl) {
    try {
      const origin = new URL(requestUrl).origin;
      return `${origin}/api/x/callback`;
    } catch {
      // fall through
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (appUrl) return `${appUrl}/api/x/callback`;

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/x/callback`;
  }

  return 'http://localhost:3000/api/x/callback';
}

/** Prefer the public host the browser used (Vercel forwards this). */
export function getXCallbackUrlFromRequest(request: {
  url: string;
  headers: Headers;
}): string {
  const explicit = process.env.X_REDIRECT_URI?.trim();
  if (explicit) return explicit;

  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedHost) {
    const host = forwardedHost.split(',')[0].trim();
    const proto = (forwardedProto || 'https').split(',')[0].trim();
    return `${proto}://${host}/api/x/callback`;
  }

  return getXCallbackUrl(request.url);
}

export function getPublicAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://streamstar.xyz').replace(
    /\/$/,
    ''
  );
}

export function basicAuthHeader(): string {
  const raw = `${getXClientId()}:${getXClientSecret()}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}
