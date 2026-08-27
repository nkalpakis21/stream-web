/**
 * Locked vocal / style identity for MusicGPT song generation.
 *
 * Current MusicGPT MusicAI (`/MusicAI`) accepts `music_style` as a text
 * description. It does **not** expose a persistent `voice_id` or voice-clone
 * parameter on this endpoint — there is no custom vocal model to train, and
 * we do not replace MusicGPT.
 *
 * Until MusicGPT adds a real voice-lock/clone field, we store `vocalIdentity`
 * on the artist at create time and send the same `music_style` string on
 * every song generate so vocal identity stays consistent across songs.
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
