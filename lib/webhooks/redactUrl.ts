/**
 * Strip callback secrets before anything is logged or returned.
 * MusicGPT receives the shared secret as `?token=` on webhook_url.
 */

const TOKEN_QUERY = /([?&]token=)[^&\s#'"]*/gi;

/** `https://host/path?token=secret` -> `https://host/path?token=[redacted]`. */
export function redactUrl(value: string): string {
  return value.replace(TOKEN_QUERY, '$1[redacted]');
}

/**
 * Redact `token=` query values and, when provided, the raw secret and its
 * percent-encoded form. Pass the webhook secret from server-only callers.
 */
export function redactSecrets(value: string, secret?: string | null): string {
  let out = value;
  const token = secret?.trim();
  if (token) {
    const encoded = encodeURIComponent(token);
    if (encoded !== token) {
      out = out.split(encoded).join('[redacted]');
    }
    out = out.split(token).join('[redacted]');
  }
  return redactUrl(out);
}

/** Walk strings, errors, and plain objects so a logged payload cannot keep the token. */
export function redactForLog(value: unknown, secret?: string | null): unknown {
  if (typeof value === 'string') return redactSecrets(value, secret);
  if (value instanceof Error) {
    const redacted = new Error(redactSecrets(value.message, secret));
    redacted.name = value.name;
    if (value.stack) {
      redacted.stack = redactSecrets(value.stack, secret);
    }
    return redacted;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactForLog(item, secret));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = redactForLog(item, secret);
    }
    return out;
  }
  return value;
}
