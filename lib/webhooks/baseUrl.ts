/**
 * Origin providers should POST webhooks to.
 *
 * Only `WEBHOOK_BASE_URL` is used. An unset or non-absolute value is missing:
 * callers must not register a callback and must not substitute a hardcoded
 * domain or the request Host. Apex hosts are not rewritten.
 */
export function absoluteHttpBaseUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    return trimmed;
  } catch {
    return null;
  }
}

export function resolveWebhookBaseUrl(
  raw: string | null | undefined = process.env.WEBHOOK_BASE_URL
): string | null {
  return absoluteHttpBaseUrl(raw);
}

/**
 * Callback MusicGPT should POST to.
 *
 * MusicGPT does not sign webhook bodies. The shared secret travels in the
 * `token` query param so we can reject anyone who learns the path.
 * Returns null when the base URL is missing, before the token is appended.
 * Never log the return value.
 */
export function musicGptWebhookUrl(
  baseUrl: string | null | undefined = resolveWebhookBaseUrl(),
  secret: string | undefined = process.env.MUSICGPT_WEBHOOK_SECRET
): string | null {
  const base = absoluteHttpBaseUrl(baseUrl);
  if (!base) return null;
  const url = `${base}/api/webhooks/musicgpt`;
  const token = secret?.trim();
  if (!token) return url;
  return `${url}?token=${encodeURIComponent(token)}`;
}

/** Path only, safe to log. Null when the base URL is missing. */
export function musicGptWebhookUrlForLog(
  baseUrl: string | null | undefined = resolveWebhookBaseUrl()
): string | null {
  const base = absoluteHttpBaseUrl(baseUrl);
  if (!base) return null;
  return `${base}/api/webhooks/musicgpt`;
}

export const WEBHOOK_BASE_URL_MISSING = 'webhook_base_url_missing';

const GENERATION_UNAVAILABLE =
  'Song generation is unavailable on this deployment: WEBHOOK_BASE_URL is not configured, so MusicGPT has no callback URL.';

export type MusicGptGenerationCallback =
  | { ok: true; webhookUrl: string }
  | { ok: false; status: 503; error: string };

/**
 * Callback URL for POST /api/generations/musicgpt.
 * A missing base URL logs `webhook_base_url_missing` and returns 503.
 * The token is not placed on a URL in that case.
 */
export function musicGptGenerationCallback(options?: {
  baseUrl?: string | null;
  secret?: string;
  warn?: (message: string) => void;
}): MusicGptGenerationCallback {
  const baseUrl =
    options && 'baseUrl' in options ? options.baseUrl : resolveWebhookBaseUrl();
  const secret =
    options && 'secret' in options ? options.secret : process.env.MUSICGPT_WEBHOOK_SECRET;
  const webhookUrl = musicGptWebhookUrl(baseUrl, secret);
  if (!webhookUrl) {
    const warn = options?.warn ?? ((message: string) => console.warn(message));
    warn(WEBHOOK_BASE_URL_MISSING);
    return { ok: false, status: 503, error: GENERATION_UNAVAILABLE };
  }
  return { ok: true, webhookUrl };
}
