import { hasObjectionableContent } from '@/lib/server/objectionable';

/**
 * Server blocklist for song-live posts.
 * A hit skips the post, marks the claim `blocked`, and is never retried.
 * The matched word is not returned.
 */

const COIN_WORDS = new Set([
  'airdrop',
  'airdrops',
  'altcoin',
  'altcoins',
  'ca',
  'coin',
  'coins',
  'contract',
  'contracts',
  'crypto',
  'cryptocurrencies',
  'cryptocurrency',
  'memecoin',
  'memecoins',
  'presale',
  'presales',
  'pump',
  'pumpfun',
  'token',
  'tokens',
]);

const THREAT =
  /\b(?:kill|murder|shoot|stab|bomb)\b(?:\s+[a-z]+){0,4}\s+\b(?:you|ya|u|them|him|her|everyone|everybody)\b/i;

const THREAT_INTENT =
  /\b(?:i(?:\s*will|'ll)|gonna|going to|ima|imma)\s+(?:kill|murder|shoot|stab)\b/i;

const CASHTAG = /\$[A-Za-z][A-Za-z0-9]{0,15}/;

export type XBlockHit = 'objectionable' | 'violence' | 'coin';

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

export function xBlocklistHit(text: string | null | undefined): XBlockHit | null {
  if (!text) return null;
  if (hasObjectionableContent(text)) return 'objectionable';
  if (THREAT.test(text) || THREAT_INTENT.test(text)) return 'violence';
  if (CASHTAG.test(text)) return 'coin';
  for (const token of tokens(text)) {
    if (COIN_WORDS.has(token)) return 'coin';
  }
  return null;
}

export function xPostBlocked(...parts: Array<string | null | undefined>): boolean {
  return parts.some(part => xBlocklistHit(part) != null);
}

export type ImageModeration = 'pass' | 'flag' | 'none';

/**
 * No image-moderation pass exists in this repo. Flagged songs and open
 * reports skip the post. Anything else is posted without the cover.
 */
export function decideXCover(input: {
  openReports: boolean;
  moderationFlagged: boolean;
  imageModeration: ImageModeration;
}): 'block' | 'attach' | 'omit' {
  if (input.openReports || input.moderationFlagged || input.imageModeration === 'flag') {
    return 'block';
  }
  if (input.imageModeration === 'pass') return 'attach';
  return 'omit';
}

export function readSongModeration(song: object): {
  moderationFlagged: boolean;
  imageModeration: ImageModeration;
} {
  const record = song as Record<string, unknown>;
  const raw = record.imageModeration ?? record.coverModeration ?? record.coverModerationStatus;
  let imageModeration: ImageModeration = 'none';
  if (raw === 'pass' || raw === 'approved' || raw === 'clean') imageModeration = 'pass';
  else if (
    raw === 'flag' ||
    raw === 'flagged' ||
    raw === 'rejected' ||
    raw === 'block' ||
    raw === 'blocked'
  ) {
    imageModeration = 'flag';
  }
  const moderationFlagged =
    record.is_flagged === true ||
    record.flagged === true ||
    record.moderationFlagged === true ||
    record.coverFlagged === true ||
    imageModeration === 'flag';
  return { moderationFlagged, imageModeration };
}
