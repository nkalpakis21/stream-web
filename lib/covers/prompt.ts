/**
 * Flux poster + Luma loop prompts for song covers.
 * Posters are song-scene-first (title, lyrics, generation prompt, genres/moods)
 * with artist identity as text only. Loops stay in that song world.
 * Artist look photos are never used as i2i references here.
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
  lyrics?: string | null;
  lore?: string | null;
  genres?: string[];
  moods?: string[];
  influences?: string[];
}

export function buildCoverPosterPrompt(input: CoverPromptInput): string {
  const artist = clip(input.artistName || 'an original music artist', 80);
  const title = clip(input.title || 'Untitled', 80);
  const parts: string[] = [
    `Square album poster artwork for the song "${title}" by artist "${artist}".`,
    'Ground the entire image in this song\'s world — setting, story, and atmosphere from the title, lyrics, and song direction.',
    'A beach song is a beach scene; a night-drive song is a night drive. Invent a unique composition for THIS song.',
    'Cinematic graphic poster, bold composition, rich color, print-quality still.',
    'No typography, no title text, no watermark, no logo, no collage border.',
    'Do not copy or restyle a reference photo, locked look, or plain headshot. Do not default to a studio portrait.',
  ];

  const songPrompt = input.songPrompt ? clip(input.songPrompt, 500) : '';
  if (songPrompt) {
    parts.push(`Song direction: ${songPrompt}`);
  }

  const lyrics = input.lyrics ? clip(input.lyrics, 480) : '';
  if (lyrics) {
    parts.push(
      `Lyrics (use as scene, imagery, and story — never as on-image text): ${lyrics}`
    );
  }

  const genres = csv(input.genres);
  const moods = csv(input.moods);
  if (genres) parts.push(`Musical genres: ${genres}.`);
  if (moods) parts.push(`Mood: ${moods}.`);

  const lore = input.lore ? clip(input.lore, 320) : '';
  const influences = csv(input.influences);
  if (lore || influences) {
    const identityBits = [
      lore ? `lore: ${lore}` : '',
      influences ? `influences: ${influences}` : '',
    ].filter(Boolean);
    parts.push(`Artist identity as text only (${identityBits.join('; ')}).`);
  }

  parts.push(
    `The artist "${artist}" may appear as one figure inside this song's scene, or not at all if environment or metaphor is stronger.`,
    'If they appear, invent a completely different pose, wardrobe, camera angle, and background that belong to this song — never a repeating headshot.',
    'Vary setting, wardrobe, pose, and lighting per song so covers do not look like restyles of the same photo.',
    'Single cohesive poster, not a photograph dump, not a crowd.'
  );
  return parts.join(' ');
}

export function buildCoverLoopPrompt(input: CoverPromptInput): string {
  const title = clip(input.title || 'Untitled', 80);
  const moods = csv(input.moods);
  const parts: string[] = [
    `Seamless looping motion of this album poster for "${title}".`,
    'Stay in the song\'s world: atmosphere and environment from the lyrics and song direction.',
    'Abstract atmospheric movement: slow camera drift, drifting light, particles, color bloom, gentle parallax.',
    'Prefer vibe and environment over faces. Do not invent new people or animate a talking head.',
    'No text, no watermark, no logo. Seamless loop, beginning blended with the end.',
  ];
  if (moods) parts.push(`Mood: ${moods}.`);
  const songPrompt = input.songPrompt ? clip(input.songPrompt, 280) : '';
  if (songPrompt) {
    parts.push(`Atmosphere from the song: ${songPrompt}`);
  }
  const lyrics = input.lyrics ? clip(input.lyrics, 220) : '';
  if (lyrics) {
    parts.push(`Lyric atmosphere: ${lyrics}`);
  }
  return parts.join(' ');
}

export function clipCoverError(message: string, max = 400): string {
  return clip(message, max);
}
