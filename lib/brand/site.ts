export const SITE_ORIGIN = 'https://www.streamstar.xyz';
export const SITE_NAME = 'Streamstar';
export const LEGAL_EMAIL = 'legal@streamstar.xyz';
export const PRIVACY_EMAIL = 'privacy@streamstar.xyz';
export const LEGAL_UPDATED = 'August 29, 2026';
export const THEME_COLOR = '#0A0A10';

export function publicPath(path: string): string {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export function publicUrl(path = '/'): string {
  const normalized = publicPath(path);
  return normalized === '/' ? SITE_ORIGIN : `${SITE_ORIGIN}${normalized}`;
}

export function shareUrl(path: string): string {
  return publicUrl(path);
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
