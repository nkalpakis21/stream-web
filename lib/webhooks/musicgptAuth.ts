import { timingSafeEqual } from 'crypto';

/**
 * MusicGPT does not document a webhook signature, HMAC, or signing secret.
 * See https://docs.musicgpt.com/api-documentation/index/webhook
 *
 * We authenticate callbacks with MUSICGPT_WEBHOOK_SECRET, which we append
 * to the registered webhook_url as `?token=`. The same secret is accepted
 * in the `x-musicgpt-webhook-token` header for callers we control.
 */
export const MUSICGPT_WEBHOOK_TOKEN_HEADER = 'x-musicgpt-webhook-token';
export const MUSICGPT_WEBHOOK_TOKEN_QUERY = 'token';

export function musicGptWebhookSecret(): string | null {
  const secret = process.env.MUSICGPT_WEBHOOK_SECRET?.trim();
  return secret || null;
}

export function webhookTokensMatch(
  provided: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!provided || !secret) return false;
  const providedBuf = Buffer.from(provided);
  const secretBuf = Buffer.from(secret);
  if (providedBuf.length !== secretBuf.length) {
    timingSafeEqual(secretBuf, secretBuf);
    return false;
  }
  return timingSafeEqual(providedBuf, secretBuf);
}

export function musicGptWebhookTokenFromRequest(request: {
  url: string;
  headers: { get(name: string): string | null };
}): string | null {
  const fromHeader = request.headers.get(MUSICGPT_WEBHOOK_TOKEN_HEADER)?.trim();
  if (fromHeader) return fromHeader;
  try {
    const token = new URL(request.url).searchParams.get(MUSICGPT_WEBHOOK_TOKEN_QUERY);
    return token?.trim() || null;
  } catch {
    return null;
  }
}
