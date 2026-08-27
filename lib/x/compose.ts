import type { StyleDNA } from '@/types/firestore';

const TWEET_LIMIT = 280;
/** X counts each URL as 23 characters (t.co wrapping). */
const URL_WEIGHT = 23;

export interface ComposeSongPostInput {
  artistName: string;
  lore: string;
  styleDNA: StyleDNA;
  songTitle: string;
  songUrl: string;
  recentPostTexts: string[];
  songId: string;
}

function clip(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function vibe(styleDNA: StyleDNA): string {
  const genres = (styleDNA.genres || []).map(g => g.trim()).filter(Boolean);
  const moods = (styleDNA.moods || []).map(m => m.trim()).filter(Boolean);
  const parts = [...moods.slice(0, 2), ...genres.slice(0, 2)];
  return parts.join(' / ');
}

function loreLine(lore: string, max: number): string {
  const first = lore.split(/[\n.!?]/)[0] || lore;
  return clip(first, max);
}

/**
 * Deterministic in-character copy from name + lore + styleDNA.
 * No LLM. Rotates templates so we do not repeat the last ~20 posts.
 */
export function composeSongLivePost(input: ComposeSongPostInput): string {
  const name = clip(input.artistName || 'Artist', 40);
  const title = clip(input.songTitle || 'a new song', 80);
  const vibeText = vibe(input.styleDNA);
  const recent = new Set(
    (input.recentPostTexts || []).map(t => t.trim().toLowerCase())
  );

  const titleLine = `"${title}" is live.`;
  const reserved = URL_WEIGHT + titleLine.length + 2; // two newlines
  const charBudget = Math.max(40, TWEET_LIMIT - reserved);

  const loreShort = loreLine(input.lore || '', Math.min(120, charBudget - name.length - 4));

  const templates: Array<() => string> = [
    () => (loreShort ? `${name}: ${loreShort}` : `${name} just dropped a new track.`),
    () =>
      vibeText
        ? `${name} — ${clip(vibeText, 60)}. ${loreShort || 'New music.'}`
        : `${name}: ${loreShort || 'New music just landed.'}`,
    () =>
      loreShort
        ? `${loreShort} — ${name}`
        : `${name} in character. New song.`
        ,
    () =>
      vibeText
        ? `${name} (${clip(vibeText, 50)}) with something new.`
        : `${name} with something new.`,
    () =>
      loreShort
        ? `${name} stays in character: ${loreShort}`
        : `${name} stays in character.`,
  ];

  const start = hashString(input.songId) % templates.length;
  let characterLine = '';
  for (let i = 0; i < templates.length; i++) {
    const candidate = clip(templates[(start + i) % templates.length](), charBudget);
    if (!recent.has(candidate.toLowerCase())) {
      characterLine = candidate;
      break;
    }
  }
  if (!characterLine) {
    characterLine = clip(`${name}: "${title}"`, charBudget);
  }

  const body = `${characterLine}\n\n${titleLine}\n${input.songUrl}`;
  return body;
}

export function composeProfileBio(lore: string, artistName: string): string {
  const prefix = clip(artistName, 40);
  const rest = clip(lore || `${prefix} on Streamstar.`, 160);
  return rest.slice(0, 160);
}

export function composeProfileName(artistName: string): string {
  return clip(artistName, 50);
}
