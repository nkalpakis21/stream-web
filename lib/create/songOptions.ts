/**
 * Song customization for /create and Studio.
 *
 * Skipping every control must match today's MusicGPT request: artist DNA as
 * `music_style`, no `gender`, and `make_instrumental: false`. Feel and energy
 * are hints appended on top of that DNA. They never replace it.
 */

export const SONG_LYRICS_MAX = 2000;

/** MusicGPT style text stays bounded. Matches the provider cap. */
export const MUSIC_STYLE_MAX_LENGTH = 1000;

export const FEEL_MAX = 2;

export const FEEL_OPTIONS = [
  { label: 'Hype', swatch: 'linear-gradient(135deg,#FF8A3D,#FF4D6A)' },
  { label: 'Chill', swatch: 'linear-gradient(135deg,#6EC8FF,#7A8CFF)' },
  { label: 'Happy', swatch: 'linear-gradient(135deg,#FFD36E,#FF9F43)' },
  { label: 'Sad', swatch: 'linear-gradient(135deg,#7A8CFF,#3D4E8C)' },
  { label: 'Romantic', swatch: 'linear-gradient(135deg,#FF8FB1,#C46BFF)' },
  { label: 'Dreamy', swatch: 'linear-gradient(135deg,#C7B6FF,#8B7CFF)' },
  { label: 'Dark', swatch: 'linear-gradient(135deg,#5C5C70,#1C1C28)' },
  { label: 'Angry', swatch: 'linear-gradient(135deg,#FF5A36,#8C1D18)' },
] as const;

export type FeelLabel = (typeof FEEL_OPTIONS)[number]['label'];

export const ENERGY_OPTIONS = ['Slow', 'Steady', 'Fast'] as const;

export type Energy = (typeof ENERGY_OPTIONS)[number];

export const VOICE_OPTIONS = ['same', 'female', 'male'] as const;

export type VoiceChoice = (typeof VOICE_OPTIONS)[number];

export const CREATE_OPTION_TAGS = ['instrumental', 'voice', 'lyrics', 'feel', 'energy'] as const;

export type CreateOptionTag = (typeof CREATE_OPTION_TAGS)[number];

/** Placeholder tempo written for a brand-new artist on /create. Midpoint is Steady. */
export const NEW_ARTIST_TEMPO = { min: 60, max: 180 } as const;

export type ArtistStyleInput = {
  id?: string | null;
  name?: string | null;
  moods?: readonly string[] | null;
  tempoMin?: number | null;
  tempoMax?: number | null;
};

export type ArtistDefaults = {
  feel: FeelLabel[];
  energy: Energy;
};

export type SongCustomizeValue = {
  instrumental: boolean;
  voice: VoiceChoice;
  feel: FeelLabel[];
  energy: Energy;
  words: 'artist' | 'mine';
  lyrics: string;
};

/**
 * Wire shape from the web client. Omitted fields mean "artist default".
 * A missing object means today's request (mobile).
 */
export type ParsedCreateOptions = {
  instrumental: boolean;
  voice: VoiceChoice;
  feel: FeelLabel[] | null;
  energy: Energy | null;
};

export type SongCreateOptionsRecord = {
  instrumental: boolean;
  voice: VoiceChoice;
  feel: string[];
  energy: Energy;
  words: 'artist' | 'mine';
};

type ArtistContextLike = {
  styleDNA?: {
    moods?: string[];
    tempoRange?: { min?: number; max?: number };
  };
} | null | undefined;

export function styleInputFromArtistContext(
  artistContext: ArtistContextLike,
  extra?: { id?: string | null; name?: string | null }
): ArtistStyleInput {
  return {
    id: extra?.id,
    name: extra?.name,
    moods: artistContext?.styleDNA?.moods ?? [],
    tempoMin: artistContext?.styleDNA?.tempoRange?.min,
    tempoMax: artistContext?.styleDNA?.tempoRange?.max,
  };
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Midpoint of the artist's BPM range.
 * Under 95 is Slow, through 125 is Steady, above that is Fast.
 * A missing range is Steady. 60–180 (the new-artist placeholder) is Steady.
 */
export function energyFromTempo(min?: number | null, max?: number | null): Energy {
  const hasMin = finite(min);
  const hasMax = finite(max);
  if (!hasMin && !hasMax) return 'Steady';
  const mid = hasMin && hasMax ? (min + max) / 2 : hasMin ? min : (max as number);
  if (mid < 95) return 'Slow';
  if (mid <= 125) return 'Steady';
  return 'Fast';
}

export function feelLabel(value: string): FeelLabel | null {
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return null;
  return FEEL_OPTIONS.find(option => option.label.toLowerCase() === cleaned)?.label ?? null;
}

/** Up to two artist moods that match a feel chip, in the artist's order. */
export function defaultFeel(moods?: readonly string[] | null): FeelLabel[] {
  const picked: FeelLabel[] = [];
  for (const mood of moods ?? []) {
    if (typeof mood !== 'string') continue;
    const label = feelLabel(mood);
    if (!label || picked.includes(label)) continue;
    picked.push(label);
    if (picked.length === FEEL_MAX) break;
  }
  return picked;
}

export function artistDefaults(artist?: ArtistStyleInput | null): ArtistDefaults {
  return {
    feel: defaultFeel(artist?.moods),
    energy: energyFromTempo(artist?.tempoMin, artist?.tempoMax),
  };
}

export function initialSongCustomize(defaults: ArtistDefaults): SongCustomizeValue {
  return {
    instrumental: false,
    voice: 'same',
    feel: [...defaults.feel],
    energy: defaults.energy,
    words: 'artist',
    lyrics: '',
  };
}

export function customizeResetKey(artist?: ArtistStyleInput | null): string {
  const defaults = artistDefaults(artist);
  return `${artist?.id ?? ''}|${defaults.feel.join(',')}|${defaults.energy}`;
}

/** Drop the oldest pick when a third chip is tapped. Tapping a selected chip removes it. */
export function toggleFeel(selected: readonly FeelLabel[], label: FeelLabel): FeelLabel[] {
  if (selected.includes(label)) return selected.filter(item => item !== label);
  if (selected.length < FEEL_MAX) return [...selected, label];
  return [...selected.slice(1), label];
}

function sameFeel(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((item, index) => item === b[index]);
}

export function displayArtistName(name?: string | null): string {
  const trimmed = name?.trim() ?? '';
  return trimmed || 'They';
}

export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/** Collapsed row. Always the artist's defaults, not the live edits. */
export function defaultsSummary(name: string | null | undefined, defaults: ArtistDefaults): string {
  const who = displayArtistName(name);
  const voice = who === 'They' ? 'Their voice' : `${possessive(who)} voice`;
  const words = who === 'They' ? 'They write the words' : `${who} writes the words`;
  const tail = [...defaults.feel, defaults.energy];
  return tail.length ? `${voice} · ${words} · ${tail.join(', ')}` : `${voice} · ${words}`;
}

export function defaultsLinkLabel(name?: string | null): string {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return 'Back to defaults';
  return `Back to ${trimmed}'s defaults`;
}

/**
 * Describes the live picks. Does not promise an exact performance.
 * Example: "Nova will make a chill, fast song, singing your words."
 */
export function previewSentence(input: {
  artistName?: string | null;
  value: SongCustomizeValue;
}): string {
  const name = displayArtistName(input.artistName);
  const descriptors = [...input.value.feel.map(feel => feel.toLowerCase()), input.value.energy.toLowerCase()];
  const song = descriptors.length ? `a ${descriptors.join(', ')} song` : 'a song';
  let sentence = `${name} will make ${song}`;
  if (input.value.instrumental) return `${sentence}, just the beat.`;
  if (input.value.voice === 'female') sentence += ', in her voice';
  if (input.value.voice === 'male') sentence += ', in his voice';
  if (input.value.words === 'mine' && input.value.lyrics.trim()) sentence += ', singing your words';
  return `${sentence}.`;
}

export function customizeChanged(value: SongCustomizeValue, defaults: ArtistDefaults): boolean {
  if (value.instrumental) return true;
  if (value.voice !== 'same') return true;
  if (value.words === 'mine') return true;
  if (!sameFeel(value.feel, defaults.feel)) return true;
  if (value.energy !== defaults.energy) return true;
  return false;
}

export function toWireCreateOptions(value: SongCustomizeValue): {
  instrumental: boolean;
  voice: VoiceChoice;
  feel: FeelLabel[];
  energy: Energy;
} {
  return {
    instrumental: value.instrumental,
    voice: value.instrumental ? 'same' : value.voice,
    feel: value.feel,
    energy: value.energy,
  };
}

function parseVoice(value: unknown): VoiceChoice {
  if (value === 'female' || value === 'male' || value === 'same') return value;
  return 'same';
}

function parseEnergy(value: unknown): Energy | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase();
  return ENERGY_OPTIONS.find(option => option.toLowerCase() === cleaned) ?? null;
}

export function parseFeelList(value: unknown): FeelLabel[] {
  if (!Array.isArray(value)) return [];
  const picked: FeelLabel[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const label = feelLabel(item);
    if (!label || picked.includes(label)) continue;
    picked.push(label);
    if (picked.length === FEEL_MAX) break;
  }
  return picked;
}

/** Null when the client omitted customization. `{}` is an explicit (empty) choice. */
export function parseCreateOptions(raw: unknown): ParsedCreateOptions | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  return {
    instrumental: record.instrumental === true,
    voice: parseVoice(record.voice),
    feel: 'feel' in record ? parseFeelList(record.feel) : null,
    energy: 'energy' in record ? parseEnergy(record.energy) : null,
  };
}

export function cleanLyrics(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, SONG_LYRICS_MAX);
}

/**
 * DNA text, then feel, then energy.
 * Pass only the hints that should be added. Defaults are omitted by the caller.
 */
export function appendCreateStyleHints(
  base: string | undefined,
  hints: { feel?: readonly string[]; energy?: string | null }
): string | undefined {
  const extra: string[] = [];
  const feel = (hints.feel ?? []).map(item => item.trim()).filter(Boolean);
  if (feel.length) extra.push(feel.join(', '));
  const energy = hints.energy?.trim();
  if (energy) extra.push(energy);
  if (!extra.length) {
    const trimmed = base?.trim() ?? '';
    return trimmed || undefined;
  }
  const suffix = extra.join('. ');
  const trimmed = base?.trim() ?? '';
  const combined = trimmed ? `${trimmed}. ${suffix}` : suffix;
  if (combined.length <= MUSIC_STYLE_MAX_LENGTH) return combined;
  return combined.slice(0, MUSIC_STYLE_MAX_LENGTH).trimEnd();
}

export type ResolvedCreateRequest = {
  music_style?: string;
  make_instrumental: boolean;
  gender?: 'female' | 'male';
  lyrics?: string;
  persisted: SongCreateOptionsRecord | null;
  used: CreateOptionTag[];
};

/**
 * Apply the panel to a DNA `music_style`.
 * `options === null` is today's request: no gender, instrumental stays off,
 * lyrics pass through, and nothing is appended.
 */
export function resolveCreateRequest(input: {
  musicStyle?: string;
  options: ParsedCreateOptions | null;
  lyrics?: string | null;
  defaults: ArtistDefaults;
}): ResolvedCreateRequest {
  const lyrics = cleanLyrics(input.lyrics);
  if (!input.options) {
    return {
      music_style: input.musicStyle?.trim() || undefined,
      make_instrumental: false,
      lyrics,
      persisted: null,
      used: [],
    };
  }

  const options = input.options;
  const instrumental = options.instrumental;
  const feel = options.feel ?? input.defaults.feel;
  const energy = options.energy ?? input.defaults.energy;
  const voice: VoiceChoice = instrumental ? 'same' : options.voice;
  const sendLyrics = !instrumental ? lyrics : undefined;
  const feelChanged = options.feel != null && !sameFeel(options.feel, input.defaults.feel);
  const energyChanged = options.energy != null && options.energy !== input.defaults.energy;
  const feelHint = feelChanged && feel.length ? feel : [];
  const energyHint = energyChanged ? energy : null;

  const used: CreateOptionTag[] = [];
  if (instrumental) used.push('instrumental');
  if (!instrumental && voice !== 'same') used.push('voice');
  if (sendLyrics) used.push('lyrics');
  if (feelHint.length) used.push('feel');
  if (energyHint) used.push('energy');

  return {
    music_style: appendCreateStyleHints(input.musicStyle, {
      feel: feelHint,
      energy: energyHint,
    }),
    make_instrumental: instrumental,
    ...(voice === 'female' || voice === 'male' ? { gender: voice } : {}),
    lyrics: sendLyrics,
    persisted: {
      instrumental,
      voice,
      feel: [...feel],
      energy,
      words: sendLyrics ? 'mine' : 'artist',
    },
    used,
  };
}

export type LyricsDraftResult = {
  lyrics: string;
  remaining: number;
  reason?: 'session' | 'day';
  error?: string;
};

export function newLyricsSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

const SESSION_ID = /^[A-Za-z0-9_-]{8,80}$/;

export function isLyricsSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID.test(value);
}
