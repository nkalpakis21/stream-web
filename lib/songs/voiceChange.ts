/**
 * Change the voice on a song that already exists.
 *
 * Same beat, same saved words, two new sung takes. The cap is two accepted
 * Sing Over jobs on this song. It does not create a song and does not count
 * toward a song-creation quota.
 *
 * Source audio is a stored instrumental. This module never calls a stem
 * separator. `generations.output.stems` in this app is the full-mix wav from
 * the MusicGPT webhook, not a separated beat.
 */

import type { VoiceChoice } from '@/lib/create/songOptions';
import { parseLyricsFromMetadata } from '@/lib/utils/lyrics';

export const VOICE_CHANGE_CAP = 2;

export const CHANGE_VOICE_LABEL = 'Change the voice';
export const PICK_VOICE_TITLE = 'Pick your favorite voice';
export const CHANGE_VOICE_TITLE = 'Change the voice';
export const CHANGE_VOICE_SUBTITLE = 'Same beat and words, sung fresh in a new voice.';
export const CHANGING_VOICE_LABEL = 'Changing the voice… about 4 min';
export const SING_HER_VOICE_LABEL = 'Sing it in her voice';
export const SING_HIS_VOICE_LABEL = 'Sing it in his voice';
export const CHANGE_VOICE_ERROR = "Couldn't change the voice.";
export const NO_VOICE_CHANGES_LABEL = 'No voice changes left';
export const KEEP_VOICE_LABEL = 'Keep this one';
export const KEEP_ORIGINAL_LABEL = 'Keep original';
export const ORIGINAL_LABEL = 'Original';
export const NEW_VOICE_1_LABEL = 'New voice 1';
export const NEW_VOICE_2_LABEL = 'New voice 2';

export const VOICE_CHANGE_PURPOSE = 'voice_change' as const;

export type VoiceChangeVoice = VoiceChoice;
export type SungGender = 'female' | 'male';

const FEMALE_VOICE_WORDS = ['female', 'woman', 'girl', 'she', 'her'] as const;
const MALE_VOICE_WORDS = ['male', 'man', 'boy', 'he', 'his'] as const;

function hasVoiceWord(text: string, words: readonly string[]): boolean {
  return words.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(text));
}

/**
 * Gender named in free text. Whole words only. Both sides, or neither, is unknown.
 * "warm alto" does not count: it never names a gender.
 */
export function genderFromVoiceText(text: string | null | undefined): SungGender | null {
  const value = text?.trim() ?? '';
  if (!value) return null;
  const female = hasVoiceWord(value, FEMALE_VOICE_WORDS);
  const male = hasVoiceWord(value, MALE_VOICE_WORDS);
  if (female === male) return null;
  return female ? 'female' : 'male';
}

/**
 * The voice on the song wins when it was saved as her or his.
 * `same` and a missing choice mean the artist's voice.
 */
export function currentSungGender(input: {
  songVoice?: string | null;
  artistVoice?: string | null;
}): SungGender | null {
  if (input.songVoice === 'female' || input.songVoice === 'male') return input.songVoice;
  return genderFromVoiceText(input.artistVoice);
}

export function otherVoiceChoice(current: SungGender | null): SungGender | null {
  if (current === 'female') return 'male';
  if (current === 'male') return 'female';
  return null;
}

export function singVoiceLabel(voice: SungGender): string {
  return voice === 'female' ? SING_HER_VOICE_LABEL : SING_HIS_VOICE_LABEL;
}

const MAX_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/** Milliseconds from the accepted voice change to the keep. Null when the clock is missing or absurd. */
export function msBetween(startedAtMs: number | null, nowMs: number): number | null {
  if (startedAtMs == null || !Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return null;
  const elapsed = Math.round(nowMs - startedAtMs);
  if (!Number.isInteger(elapsed) || elapsed < 0 || elapsed > MAX_KEEP_MS) return null;
  return elapsed;
}

export function defaultVoiceSelection(
  current: CompareRowKey,
  voice1: CompareRow['status'] | undefined,
  voice2: CompareRow['status'] | undefined
): CompareRowKey {
  if (current === '1' && voice1 === 'failed' && voice2 === 'ready') return '2';
  return current;
}
export type VoiceChangeStatus = 'making' | 'ready' | 'failed';

export type VoiceChangeRecord = {
  used?: number | null;
  status?: string | null;
  voice?: string | null;
  generationId?: string | null;
  originalVersionId?: string | null;
  sourceVersionId?: string | null;
  creditEstimate?: number | null;
};

export type VoiceVersionRef = {
  id: string;
  audioURL?: string | null;
  providerOutputId?: string | null;
  isPrimary?: boolean;
  versionNumber?: number;
};

export type VoiceGenerationRef = {
  id?: string;
  status?: string | null;
  createdAtMs?: number | null;
  providerConversionIds?: string[] | null;
  providerFailedConversions?: string[] | null;
  parameters?: {
    job?: unknown;
    purpose?: unknown;
    sourceVersionId?: unknown;
  } | null;
  output?: { metadata?: Record<string, unknown> | null; stems?: unknown } | null;
};

export type CompareRowKey = 'original' | '1' | '2';

export type CompareRow = {
  key: CompareRowKey;
  label: string;
  status: 'ready' | 'pending' | 'failed';
  versionId: string | null;
  audioUrl: string | null;
};

export type VoiceChangeSnapshot = {
  show: boolean;
  used: number;
  status: VoiceChangeStatus | null;
  voice: VoiceChangeVoice | null;
  generationId: string | null;
  originalVersionId: string | null;
  originalAudioUrl: string | null;
  conversionIds: string[];
  failedConversionIds: string[];
};

export function voiceChangesLeft(used: number): number {
  if (!Number.isFinite(used) || used <= 0) return VOICE_CHANGE_CAP;
  return Math.max(0, VOICE_CHANGE_CAP - Math.floor(used));
}

/** Page action and the sheet's Ice button. Zero left stays the disabled label. */
export function voiceChangeActionLabel(used: number): string {
  const left = voiceChangesLeft(used);
  if (left <= 0) return NO_VOICE_CHANGES_LABEL;
  return `${CHANGE_VOICE_LABEL} (${left} left)`;
}

export function voiceChangeSpent(used: number): boolean {
  return voiceChangesLeft(used) <= 0;
}

/** A voice change reuses the song. It is not a new song and not a quota charge. */
export function countsTowardSongQuota(): boolean {
  return false;
}

export function isVoiceChangeGeneration(parameters: unknown): boolean {
  if (!parameters || typeof parameters !== 'object') return false;
  return (parameters as { purpose?: unknown }).purpose === VOICE_CHANGE_PURPOSE;
}

export function readVoiceChangeStatus(value: unknown): VoiceChangeStatus | null {
  if (value === 'making' || value === 'ready' || value === 'failed') return value;
  return null;
}

export function readVoiceChangeVoice(value: unknown): VoiceChangeVoice | null {
  if (value === 'same' || value === 'female' || value === 'male') return value;
  return null;
}

export function songIsInstrumental(song: {
  createOptions?: { instrumental?: boolean; voice?: string | null } | null;
  beatFirst?: { stage?: string | null } | null;
}): boolean {
  if (song.createOptions?.instrumental === true) return true;
  return song.beatFirst?.stage === 'instrumental';
}

function audioUrlOf(version: { audioURL?: string | null } | null | undefined): string | null {
  const url = version?.audioURL?.trim() ?? '';
  return url || null;
}

function millisOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof (value as { toMillis: unknown }).toMillis === 'function'
  ) {
    const ms = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/**
 * Lyrics saved on a completed generation, the same metadata shape the song
 * page already reads. Empty when the song never stored words.
 */
export function savedLyricsText(
  generations: readonly VoiceGenerationRef[],
  conversionId?: string | null
): string | null {
  const completed = generations
    .filter((generation) => generation.status === 'completed' && generation.output?.metadata)
    .slice()
    .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
  const read = (generation: VoiceGenerationRef, id?: string) => {
    const metadata = generation.output?.metadata;
    if (!metadata) return null;
    const lyrics = parseLyricsFromMetadata(metadata, id);
    const text = lyrics?.raw.trim() ?? '';
    return text || null;
  };
  if (conversionId) {
    for (const generation of completed) {
      const text = read(generation, conversionId);
      if (text) return text;
    }
  }
  for (const generation of completed) {
    const text = read(generation);
    if (text) return text;
  }
  return null;
}

function playable(version: VoiceVersionRef | undefined): { versionId: string; audioUrl: string } | null {
  if (!version) return null;
  const audioUrl = audioUrlOf(version);
  if (!audioUrl) return null;
  return { versionId: version.id, audioUrl };
}

/**
 * Stored instrumental only.
 *
 * 1. The beat the owner already chose (`beatFirst.chosenVersionId`).
 * 2. The source version of the latest Sing Over that was not itself a voice change.
 * 3. A playable file from the latest `job: 'beat'` generation.
 * 4. The current file when the song itself is an instrumental.
 *
 * A vocal mix is not a beat. Stem separation is not called.
 */
export function resolveStoredInstrumental(input: {
  song: {
    currentVersionId?: string | null;
    createOptions?: { instrumental?: boolean; voice?: string | null } | null;
    beatFirst?: { stage?: string | null; chosenVersionId?: string | null } | null;
  };
  versions: readonly VoiceVersionRef[];
  generations: readonly VoiceGenerationRef[];
}): { versionId: string; audioUrl: string } | null {
  const byId = new Map(input.versions.map((version) => [version.id, version]));
  const chosen = playable(byId.get(input.song.beatFirst?.chosenVersionId ?? ''));
  if (chosen) return chosen;

  const singOvers = input.generations
    .filter((generation) => generation.parameters?.job === 'sing_over' && !isVoiceChangeGeneration(generation.parameters))
    .slice()
    .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
  for (const generation of singOvers) {
    const sourceId = generation.parameters?.sourceVersionId;
    if (typeof sourceId !== 'string') continue;
    const source = playable(byId.get(sourceId));
    if (source) return source;
  }

  const beats = input.generations
    .filter((generation) => generation.parameters?.job === 'beat')
    .slice()
    .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
  const latestBeat = beats[0];
  if (latestBeat) {
    const ids = new Set((latestBeat.providerConversionIds ?? []).filter((id) => id.trim()));
    const matches = input.versions
      .filter((version) => {
        const output = version.providerOutputId?.trim() ?? '';
        return Boolean(output) && ids.has(output) && audioUrlOf(version);
      })
      .slice()
      .sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (b.isPrimary && !a.isPrimary) return 1;
        return (a.versionNumber ?? 0) - (b.versionNumber ?? 0);
      });
    const beat = playable(matches[0]);
    if (beat) return beat;
  }

  if (songIsInstrumental(input.song)) {
    const current =
      playable(byId.get(input.song.currentVersionId ?? '')) ??
      playable(input.versions.find((version) => version.isPrimary));
    if (current) return current;
  }

  return null;
}

export function shouldOfferVoiceChange(input: {
  /** Normal songs stay hidden until a later stem split can supply a beat. */
  beatFirst: boolean;
  instrumental: boolean;
  lyrics: string | null;
  source: { versionId: string } | null;
  used: number;
  status: VoiceChangeStatus | null;
}): boolean {
  if (!input.beatFirst || input.instrumental || !input.lyrics) return false;
  if (input.used > 0 || input.status) return true;
  return Boolean(input.source);
}

function generationTime(generation: {
  createdAtMs?: number | null;
  createdAt?: unknown;
}): number | null {
  if (typeof generation.createdAtMs === 'number') return generation.createdAtMs;
  return millisOf(generation.createdAt);
}

export function voiceChangeSnapshot(input: {
  song: {
    path?: string | null;
    currentVersionId?: string | null;
    createOptions?: { instrumental?: boolean; voice?: string | null } | null;
    beatFirst?: { stage?: string | null; chosenVersionId?: string | null } | null;
    voiceChange?: VoiceChangeRecord | null;
  };
  versions: readonly VoiceVersionRef[];
  generations: ReadonlyArray<
    VoiceGenerationRef & {
      createdAt?: unknown;
    }
  >;
}): VoiceChangeSnapshot {
  const generations: VoiceGenerationRef[] = input.generations.map((generation) => ({
    ...generation,
    createdAtMs: generationTime(generation),
  }));
  const current = input.versions.find((version) => version.id === input.song.currentVersionId);
  const lyrics = savedLyricsText(generations, current?.providerOutputId ?? null);
  const source = resolveStoredInstrumental({ song: input.song, versions: input.versions, generations });
  const record = input.song.voiceChange ?? null;
  const used = typeof record?.used === 'number' && Number.isFinite(record.used) ? Math.max(0, Math.floor(record.used)) : 0;
  const status = readVoiceChangeStatus(record?.status);
  const voice = readVoiceChangeVoice(record?.voice);
  const generationId = typeof record?.generationId === 'string' ? record.generationId : null;
  const originalVersionId =
    typeof record?.originalVersionId === 'string' ? record.originalVersionId : input.song.currentVersionId ?? null;
  const original = input.versions.find((version) => version.id === originalVersionId);
  const active = generations.find((generation) => generation.id === generationId) ?? null;
  const show = shouldOfferVoiceChange({
    beatFirst: input.song.path === 'beat_first',
    instrumental: songIsInstrumental(input.song),
    lyrics,
    source,
    used,
    status,
  });
  return {
    show,
    used,
    status,
    voice,
    generationId,
    originalVersionId,
    originalAudioUrl: audioUrlOf(original),
    conversionIds: (active?.providerConversionIds ?? []).filter((id) => id.trim().length > 0).slice(0, 2),
    failedConversionIds: (active?.providerFailedConversions ?? []).filter((id) => id.trim().length > 0),
  };
}

export function buildVoiceCompareRows(input: {
  originalVersionId: string | null;
  originalAudioUrl: string | null;
  conversionIds: readonly string[];
  failedConversionIds: readonly string[];
  versions: readonly VoiceVersionRef[];
}): [CompareRow, CompareRow, CompareRow] {
  const byOutput = new Map<string, VoiceVersionRef>();
  for (const version of input.versions) {
    const output = version.providerOutputId?.trim() ?? '';
    if (output) byOutput.set(output, version);
  }
  const failed = new Set(input.failedConversionIds);
  const voiceRow = (index: 0 | 1, label: string): CompareRow => {
    const conversionId = input.conversionIds[index]?.trim() ?? '';
    if (!conversionId) {
      return { key: index === 0 ? '1' : '2', label, status: 'pending', versionId: null, audioUrl: null };
    }
    const version = byOutput.get(conversionId);
    const audioUrl = audioUrlOf(version);
    if (audioUrl && version) {
      return { key: index === 0 ? '1' : '2', label, status: 'ready', versionId: version.id, audioUrl };
    }
    if (failed.has(conversionId)) {
      return { key: index === 0 ? '1' : '2', label, status: 'failed', versionId: version?.id ?? null, audioUrl: null };
    }
    return { key: index === 0 ? '1' : '2', label, status: 'pending', versionId: null, audioUrl: null };
  };
  const originalAudio = input.originalAudioUrl?.trim() || null;
  return [
    {
      key: 'original',
      label: ORIGINAL_LABEL,
      status: originalAudio ? 'ready' : 'pending',
      versionId: input.originalVersionId,
      audioUrl: originalAudio,
    },
    voiceRow(0, NEW_VOICE_1_LABEL),
    voiceRow(1, NEW_VOICE_2_LABEL),
  ];
}

export function compareHasNewAudio(rows: readonly CompareRow[]): boolean {
  return rows.some((row) => row.key !== 'original' && row.status === 'ready');
}
