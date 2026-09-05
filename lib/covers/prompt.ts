/**
 * Flux poster + Luma loop prompts for song covers.
 * Poster uses locked artist look + title/prompt. Loops prefer abstract vibe.
 */

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trim()}…`;
}

function csv(values?: string[]): string {
  return (values ?? []).map(v => v.trim()).filter(Boolean).join(', ');
}

export interface CoverPromptInput {
  artistName?: string | null;
  title?: string | null;
  songPrompt?: string | null;
  lore?: string | null;
  genres?: string[];
  moods?: string[];
  hasLockedLook?: boolean;
}

export function buildCoverPosterPrompt(input: CoverPromptInput): string {
  const artist = clip(input.artistName || 'an original music artist', 80);
  const title = clip(input.title || 'Untitled', 80);
  const parts: string[] = [
    `Square album poster artwork for the song "${title}" by artist "${artist}".`,
    'Cinematic graphic poster, bold composition, rich color, print-quality still.',
    'No typography, no title text, no watermark, no logo, no collage border.',
  ];

  if (input.hasLockedLook) {
    parts.push(
      'Keep the locked artist look as the visual identity; stylize into poster art rather than a plain headshot.'
    );
  }

  const lore = input.lore ? clip(input.lore, 400) : '';
  if (lore) {
    parts.push(`Artist identity: ${lore}`);
  }

  const genres = csv(input.genres);
  const moods = csv(input.moods);
  if (genres) parts.push(`Musical genres: ${genres}.`);
  if (moods) parts.push(`Mood: ${moods}.`);

  const songPrompt = input.songPrompt ? clip(input.songPrompt, 500) : '';
  if (songPrompt) {
    parts.push(`Song direction: ${songPrompt}`);
  }

  parts.push('Single cohesive poster, not a photograph dump, not a crowd.');
  return parts.join(' ');
}

export function buildCoverLoopPrompt(input: CoverPromptInput): string {
  const title = clip(input.title || 'Untitled', 80);
  const moods = csv(input.moods);
  const parts: string[] = [
    `Seamless looping motion of this album poster for "${title}".`,
    'Abstract atmospheric movement: slow camera drift, drifting light, particles, color bloom, gentle parallax.',
    'Prefer vibe and environment over faces. Do not invent new people or animate a talking head.',
    'No text, no watermark, no logo. Seamless loop, beginning blended with the end.',
  ];
  if (moods) parts.push(`Mood: ${moods}.`);
  const songPrompt = input.songPrompt ? clip(input.songPrompt, 280) : '';
  if (songPrompt) {
    parts.push(`Atmosphere from the song: ${songPrompt}`);
  }
  return parts.join(' ');
}

export function clipCoverError(message: string, max = 400): string {
  return clip(message, max);
}
