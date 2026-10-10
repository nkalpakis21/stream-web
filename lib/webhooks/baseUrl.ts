export const DEFAULT_WEBHOOK_BASE_URL = 'https://www.streamstar.xyz';

/**
 * Origin providers should POST webhooks to.
 *
 * Apex `streamstar.xyz` 307s to www. MusicGPT does not successfully re-POST
 * through that redirect, so conversion-complete events never reach the
 * handler. Prefer `WEBHOOK_BASE_URL` when it is a usable non-apex origin;
 * otherwise default to www.
 */
export function resolveWebhookBaseUrl(
  raw: string | undefined = process.env.WEBHOOK_BASE_URL
): string {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    return DEFAULT_WEBHOOK_BASE_URL;
  }

  try {
    const hostname = new URL(trimmed).hostname.toLowerCase();
    if (hostname === 'streamstar.xyz') {
      return DEFAULT_WEBHOOK_BASE_URL;
    }
  } catch {
    return DEFAULT_WEBHOOK_BASE_URL;
  }

  return trimmed;
}

/**
 * Callback MusicGPT should POST to.
 *
 * MusicGPT does not sign webhook bodies. The shared secret travels in the
 * `token` query param so we can reject anyone who learns the path.
 * Never log the return value.
 */
export function musicGptWebhookUrl(
  baseUrl: string = resolveWebhookBaseUrl(),
  secret: string | undefined = process.env.MUSICGPT_WEBHOOK_SECRET
): string {
  const url = `${baseUrl}/api/webhooks/musicgpt`;
  const token = secret?.trim();
  if (!token) return url;
  return `${url}?token=${encodeURIComponent(token)}`;
}

/** Path only, safe to log. */
export function musicGptWebhookUrlForLog(
  baseUrl: string = resolveWebhookBaseUrl()
): string {
  return `${baseUrl}/api/webhooks/musicgpt`;
}
