/**
 * Create-time artist look prompts for Fal Flux.
 *
 * Looks are generated once at artist create and persisted on `avatarURL`.
 * Per-song face generation is intentionally not done here.
 */

export interface ArtistLookPromptInput {
  name: string;
  lore?: string;
  genres?: string[];
  moods?: string[];
  influences?: string[];
  lookNotes?: string;
  hasReference?: boolean;
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trim()}…`;
}

function csv(values?: string[]): string {
  return (values ?? []).map(v => v.trim()).filter(Boolean).join(', ');
}

/**
 * Build a Flux prompt from the artist's style DNA + lore (+ optional notes).
 */
export function buildArtistLookPrompt(input: ArtistLookPromptInput): string {
  const name = clip(input.name || 'an original music artist', 80);
  const parts: string[] = [
    `Photorealistic portrait of a single music artist named "${name}".`,
    'One consistent person, face clearly visible, head and shoulders, studio lighting.',
    'Character identity is locked — do not invent a different face.',
  ];

  const lore = input.lore ? clip(input.lore, 600) : '';
  if (lore) {
    parts.push(`Backstory and personality: ${lore}`);
  }

  const genres = csv(input.genres);
  const moods = csv(input.moods);
  const influences = csv(input.influences);
  if (genres) parts.push(`Musical genres: ${genres}.`);
  if (moods) parts.push(`Mood: ${moods}.`);
  if (influences) parts.push(`Visual/cultural influences: ${influences}.`);

  const notes = input.lookNotes ? clip(input.lookNotes, 400) : '';
  if (notes) {
    parts.push(`Additional look direction from the creator: ${notes}`);
  }

  if (input.hasReference) {
    parts.push(
      'Keep the same person as the reference photo; adapt wardrobe, lighting, and styling to this artist identity.'
    );
  }

  parts.push(
    'Single subject, no text, no watermark, no logo, no collage, not album cover art, not a crowd.'
  );

  return parts.join(' ');
}
