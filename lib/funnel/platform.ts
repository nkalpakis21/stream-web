/**
 * Client platform for funnel events.
 *
 * The web app sends `x-streamstar-platform: web` on its API requests.
 * iOS sends `x-streamstar-platform: ios`. The value is stored only when
 * that header is present and is exactly `web` or `ios`. Anything else,
 * including a missing header, is `unknown`.
 */

export const FUNNEL_PLATFORM_HEADER = 'x-streamstar-platform';

export const FUNNEL_PLATFORMS = ['web', 'ios', 'unknown'] as const;

export type FunnelPlatform = (typeof FUNNEL_PLATFORMS)[number];

type HeaderSource = {
  headers: { get(name: string): string | null };
};

/** `web` or `ios` when the header value is valid. Otherwise `unknown`. */
export function platformFromHeader(value: string | null | undefined): FunnelPlatform {
  if (typeof value !== 'string') return 'unknown';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'ios') return 'ios';
  if (normalized === 'web') return 'web';
  return 'unknown';
}

/** Reads only `x-streamstar-platform`. A missing or invalid header is `unknown`. */
export function platformFromRequest(request: HeaderSource): FunnelPlatform {
  return platformFromHeader(request.headers.get(FUNNEL_PLATFORM_HEADER));
}

/** Headers for a browser request. Always sets the web platform. */
export function webPlatformHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  next.set(FUNNEL_PLATFORM_HEADER, 'web');
  return next;
}
