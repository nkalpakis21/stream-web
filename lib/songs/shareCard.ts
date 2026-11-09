import type { Metadata } from 'next';
import { brandOgImageMeta, brandOgImageUrl, coverArtAlt, publicUrl } from '@/lib/brand/site';
import { getInitials } from '@/lib/utils/avatar';
import {
  hiddenSongPageMetadata,
  songIsVisible,
  type SongVisibilityInput,
} from '@/lib/songs/visibility';

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;
export const SHARE_CARD_PADDING = 60;
export const SHARE_COVER_SIZE = 510;
export const SHARE_COVER_RADIUS = 28;
export const SHARE_COLUMN_X = 630;
export const SHARE_COLUMN_RIGHT = 1140;
export const SHARE_COLUMN_WIDTH = SHARE_COLUMN_RIGHT - SHARE_COLUMN_X;
export const SHARE_TITLE_SIZE = 64;
export const SHARE_TITLE_SIZE_COMPACT = 52;
export const SHARE_ARTIST_SIZE = 30;
export const SHARE_FACE_SIZE = 72;
export const SHARE_LISTEN = 'Listen on Streamstar';

const TITLE_WIDTH = SHARE_COLUMN_WIDTH;
const ARTIST_WIDTH = SHARE_COLUMN_WIDTH - SHARE_FACE_SIZE - 16;

export type ShareArt =
  | { kind: 'brand' }
  | {
      kind: 'card';
      square: { type: 'image'; url: string } | { type: 'initials'; initials: string };
      face: { type: 'image'; url: string } | { type: 'initials'; initials: string };
    };

export type SharePageGate = 'not-found' | 'hidden' | 'public';

function cleanUrl(value?: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Card art for a song X may preview.
 * No cover: the face fills the square. No face: initials on #14141C.
 * Neither, or a song that is not publicly playable: the brand image.
 */
export function selectShareArt(input: {
  shareable: boolean;
  coverUrl?: string | null;
  faceUrl?: string | null;
  artistName?: string | null;
}): ShareArt {
  const cover = cleanUrl(input.coverUrl);
  const face = cleanUrl(input.faceUrl);
  if (!input.shareable || (!cover && !face)) return { kind: 'brand' };
  const initials = getInitials(input.artistName?.trim() || 'Artist');
  return {
    kind: 'card',
    square: cover ? { type: 'image', url: cover } : { type: 'image', url: face as string },
    face: face ? { type: 'image', url: face } : { type: 'initials', initials },
  };
}

export type ShareGateSong = SongVisibilityInput & {
  generationStatus?: unknown;
};

/**
 * A song may be shared when it is public, not deleted, not waiting on its
 * first audio file, and not a failed generation. Older songs omit audioReady.
 */
export function songIsSharePublic(song: ShareGateSong | null | undefined): boolean {
  if (!song || song.deletedAt) return false;
  if (song.isPublic !== true) return false;
  if (song.audioReady === false) return false;
  if (song.generationStatus === 'failed') return false;
  return true;
}

/**
 * Deleted, private, not-ready, and failed songs 404 for everyone except the
 * owner. The owner can open the page, and that page has no card.
 */
export function sharePageGate(
  song: ShareGateSong | null | undefined,
  viewerId: string | null | undefined
): SharePageGate {
  if (!songIsVisible(song, viewerId)) return 'not-found';
  if (songIsSharePublic(song)) return 'public';
  const owner =
    !!song &&
    typeof viewerId === 'string' &&
    viewerId.length > 0 &&
    song.ownerId === viewerId;
  return owner ? 'hidden' : 'not-found';
}

export function shareImageVersionMs(
  stamps: Array<number | null | undefined>
): number | null {
  let max: number | null = null;
  for (const stamp of stamps) {
    if (typeof stamp !== 'number' || !Number.isFinite(stamp) || stamp <= 0) continue;
    const whole = Math.trunc(stamp);
    if (max == null || whole > max) max = whole;
  }
  return max;
}

/** Latest cover or face write. A missing image does not contribute a stamp. */
export function coverFaceVersionMs(input: {
  coverUrl?: string | null;
  coverUpdatedAtMs?: number | null;
  songUpdatedAtMs?: number | null;
  faceUrl?: string | null;
  faceUpdatedAtMs?: number | null;
}): number | null {
  const cover = cleanUrl(input.coverUrl);
  const face = cleanUrl(input.faceUrl);
  return shareImageVersionMs([
    cover ? input.coverUpdatedAtMs ?? input.songUpdatedAtMs : null,
    face ? input.faceUpdatedAtMs : null,
  ]);
}

export function shareImagePath(songId: string, versionMs: number | null): string {
  const path = `/songs/${encodeURIComponent(songId)}/opengraph-image`;
  return versionMs == null ? path : `${path}?v=${versionMs}`;
}

function charWidth(ch: string, fontSize: number, factor: number): number {
  if (ch === ' ' || ch === '\n' || ch === '\t') return fontSize * 0.33;
  if ('ilI\'|.,:;!'.includes(ch)) return fontSize * 0.28;
  if ('mwMW'.includes(ch)) return fontSize * factor * 1.45;
  const upper = ch !== ch.toLowerCase() && ch === ch.toUpperCase();
  return fontSize * factor * (upper ? 1.25 : 1);
}

export function measureShareText(text: string, fontSize: number, factor = 0.52): number {
  let width = 0;
  for (const ch of text) width += charWidth(ch, fontSize, factor);
  return width;
}

function truncateToWidth(text: string, fontSize: number, maxWidth: number, factor: number): string {
  const ellipsis = '…';
  if (measureShareText(text, fontSize, factor) <= maxWidth) return text;
  let out = '';
  for (const ch of text) {
    const next = out + ch;
    if (measureShareText(`${next}${ellipsis}`, fontSize, factor) > maxWidth) break;
    out = next;
  }
  const trimmed = out.trimEnd();
  return trimmed ? `${trimmed}${ellipsis}` : ellipsis;
}

function wrapLines(text: string, fontSize: number, maxWidth: number, factor: number): string[] | null {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (measureShareText(word, fontSize, factor) > maxWidth) return null;
    const next = current ? `${current} ${word}` : word;
    if (measureShareText(next, fontSize, factor) <= maxWidth) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length > 2) return null;
  }
  if (current) lines.push(current);
  if (lines.length === 0 || lines.length > 2) return null;
  return lines;
}

function ellipsisLines(text: string, fontSize: number, maxWidth: number, factor: number): string[] {
  const words = text.split(' ');
  let line1 = '';
  let index = 0;
  for (; index < words.length; index += 1) {
    const next = line1 ? `${line1} ${words[index]}` : words[index];
    if (measureShareText(next, fontSize, factor) <= maxWidth) {
      line1 = next;
      continue;
    }
    break;
  }
  if (!line1) {
    return [truncateToWidth(text, fontSize, maxWidth, factor)];
  }
  const rest = words.slice(index).join(' ');
  if (!rest) return [line1];
  return [line1, truncateToWidth(rest, fontSize, maxWidth, factor)];
}

/** Playfair title. 64px when two lines fit, otherwise 52px, then an ellipsis. */
export function layoutShareTitle(title: string): { lines: string[]; fontSize: 64 | 52 } {
  const clean = title.replace(/\s+/g, ' ').trim() || 'Untitled';
  const at64 = wrapLines(clean, SHARE_TITLE_SIZE, TITLE_WIDTH, 0.52);
  if (at64) return { lines: at64, fontSize: SHARE_TITLE_SIZE };
  const at52 = wrapLines(clean, SHARE_TITLE_SIZE_COMPACT, TITLE_WIDTH, 0.52);
  if (at52) return { lines: at52, fontSize: SHARE_TITLE_SIZE_COMPACT };
  return {
    lines: ellipsisLines(clean, SHARE_TITLE_SIZE_COMPACT, TITLE_WIDTH, 0.52).slice(0, 2),
    fontSize: SHARE_TITLE_SIZE_COMPACT,
  };
}

export function layoutShareArtist(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim() || 'Unknown Artist';
  return truncateToWidth(clean, SHARE_ARTIST_SIZE, ARTIST_WIDTH, 0.56);
}

export function buildSongShareMetadata(input: {
  songId: string;
  title: string;
  artistName: string;
  card: boolean;
  versionMs: number | null;
}): Metadata {
  const title = input.title.trim() || 'Untitled';
  const artistName = input.artistName.trim() || 'Unknown Artist';
  const shareTitle = `${title} by ${artistName}`;
  const description = SHARE_LISTEN;
  const pageUrl = publicUrl(`/songs/${input.songId}`);
  const image = input.card
    ? {
        url: publicUrl(shareImagePath(input.songId, input.versionMs)),
        width: SHARE_CARD_WIDTH,
        height: SHARE_CARD_HEIGHT,
        alt: coverArtAlt(title),
      }
    : brandOgImageMeta(shareTitle);

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title: shareTitle,
      description,
      type: 'music.song',
      url: pageUrl,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: shareTitle,
      description,
      images: [image.url],
    },
  };
}

export type SongShareFacts =
  | { gate: 'not-found' }
  | { gate: 'hidden' }
  | {
      gate: 'public';
      songId: string;
      title: string;
      artistName: string;
      audioReady: boolean;
      coverUrl: string | null;
      faceUrl: string | null;
      versionMs: number | null;
    };

/** Metadata for /songs/[id]. `notFound` is a 404 with no tags. Hidden pages stay generic. */
export function metadataFromShareFacts(
  facts: SongShareFacts
): { notFound: true } | { notFound: false; metadata: Metadata } {
  if (facts.gate === 'not-found') return { notFound: true };
  if (facts.gate === 'hidden') return { notFound: false, metadata: hiddenSongPageMetadata() };
  const art = selectShareArt({
    shareable: facts.audioReady,
    coverUrl: facts.coverUrl,
    faceUrl: facts.faceUrl,
    artistName: facts.artistName,
  });
  return {
    notFound: false,
    metadata: buildSongShareMetadata({
      songId: facts.songId,
      title: facts.title,
      artistName: facts.artistName,
      card: art.kind === 'card',
      versionMs: facts.versionMs,
    }),
  };
}

export function brandShareImageUrl(): string {
  return brandOgImageUrl();
}

/** Content-Type for a fetched cover or face. S3 sometimes sends octet-stream for a JPEG. */
export function shareImageContentType(header: string | null, bytes: Uint8Array): string | null {
  const declared = header?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (declared.startsWith('image/')) return declared;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length >= 6) {
    const gif = String.fromCharCode(...bytes.slice(0, 6));
    if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  }
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
  }
  return null;
}
