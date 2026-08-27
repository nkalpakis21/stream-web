/**
 * Locked vocal / style identity for MusicGPT song generation.
 *
 * Current MusicGPT MusicAI (`/MusicAI`) accepts `music_style` as a text
 * description. It does **not** expose a persistent `voice_id` or voice-clone
 * parameter on this endpoint — there is no custom vocal model to train, and
 * we do not replace MusicGPT.
 *
 * Live MusicGPT requests use `buildMusicGPTStyleFromArtistContext` in
 * `lib/ai/providers/musicgpt.ts`, which prepends `vocalIdentity` to the
 * full style DNA string (genres, moods, tempo, influences, lore).
 */

export interface MusicStyleContext {
  vocalIdentity?: string | null;
  styleDNA?: {
    genres?: string[];
    moods?: string[];
  };
}

export function buildMusicStyle(context?: MusicStyleContext): string | undefined {
  if (!context) return undefined;

  const parts: string[] = [];
  const vocal = context.vocalIdentity?.trim();
  if (vocal) parts.push(vocal);

  const genres = (context.styleDNA?.genres ?? []).map(g => g.trim()).filter(Boolean);
  if (genres.length) parts.push(genres.join(', '));

  const moods = (context.styleDNA?.moods ?? []).map(m => m.trim()).filter(Boolean);
  if (moods.length) parts.push(moods.join(', '));

  return parts.length > 0 ? parts.join('. ') : undefined;
}
