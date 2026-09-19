export const SITE_ORIGIN = 'https://streamstar.xyz';
/** Vercel primary. Apex 307s here — use for canonical, OG, sitemap, and share. */
export const SITE_WWW_ORIGIN = 'https://www.streamstar.xyz';
export const SITE_NAME = 'Streamstar';
export const LEGAL_EMAIL = 'legal@streamstar.xyz';
export const PRIVACY_EMAIL = 'privacy@streamstar.xyz';
export const LEGAL_UPDATED = 'September 2, 2026';
export const THEME_COLOR = '#0A0A10';
export const SITE_OG_IMAGE_PATH = '/og-image.png';
export const SITE_OG_IMAGE_WIDTH = 1200;
export const SITE_OG_IMAGE_HEIGHT = 630;

export function publicPath(path: string): string {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export function publicUrl(path = '/'): string {
  const normalized = publicPath(path);
  return normalized === '/' ? SITE_WWW_ORIGIN : `${SITE_WWW_ORIGIN}${normalized}`;
}

export function shareUrl(path: string): string {
  return publicUrl(path);
}

export function brandOgImageUrl(): string {
  return `${SITE_WWW_ORIGIN}${SITE_OG_IMAGE_PATH}`;
}

/**
 * Absolute HTTPS image URL for og:image / twitter:image.
 * Missing, relative-invalid, or non-HTTPS values fall back to the shipped brand OG.
 * Apex streamstar.xyz assets are rewritten to www so crawlers skip the 307.
 */
export function shareImageUrl(candidate?: string | null): string {
  const trimmed = candidate?.trim();
  if (!trimmed) return brandOgImageUrl();

  try {
    const url = trimmed.startsWith('/')
      ? new URL(trimmed, SITE_WWW_ORIGIN)
      : new URL(trimmed);
    if (url.protocol !== 'https:') return brandOgImageUrl();
    if (url.hostname.toLowerCase() === 'streamstar.xyz') {
      url.hostname = 'www.streamstar.xyz';
    }
    return url.toString();
  } catch {
    return brandOgImageUrl();
  }
}

export function brandOgImageMeta(alt = SITE_NAME) {
  return {
    url: brandOgImageUrl(),
    width: SITE_OG_IMAGE_WIDTH,
    height: SITE_OG_IMAGE_HEIGHT,
    alt,
  };
}

export function isDefaultTempoRange(
  range?: { min?: number; max?: number } | null
): boolean {
  if (!range) return true;
  const min = Number(range.min);
  const max = Number(range.max);
  return min === 60 && max === 180;
}

export function coverArtAlt(title: string): string {
  const name = title.trim() || 'Untitled';
  return `${name} cover art`;
}
