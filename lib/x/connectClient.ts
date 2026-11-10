import { webPlatformHeaders } from '@/lib/funnel/platform';

function visibleXConnectError(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  if (/X_CLIENT|env var|not configured/i.test(value)) return null;
  return value;
}

/**
 * POST /api/x/connect and follow authorizeUrl.
 * Same flow the owner X row uses. Unavailable means the server has no X app.
 */
export async function startXConnect(
  artistId: string,
  user: { getIdToken: (force?: boolean) => Promise<string> }
): Promise<{ status: 'redirect' } | { status: 'unavailable' } | { status: 'error'; message: string }> {
  const token = await user.getIdToken();
  const res = await fetch('/api/x/connect', {
    method: 'POST',
    headers: webPlatformHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ artistId }),
  });
  const data = (await res.json().catch(() => ({}))) as { available?: unknown; authorizeUrl?: unknown; error?: unknown };
  if (res.status === 503 || data.available === false) return { status: 'unavailable' };
  if (!res.ok || typeof data.authorizeUrl !== 'string' || !data.authorizeUrl) {
    return {
      status: 'error',
      message: visibleXConnectError(data.error) || 'Could not start X connect.',
    };
  }
  window.location.href = data.authorizeUrl;
  return { status: 'redirect' };
}
