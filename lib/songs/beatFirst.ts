/**
 * Beat-first song creation. One song: a v6 instrumental, then optional vocals.
 * The owner may regenerate the beat twice. Those retries do not create
 * another song. `path: 'beat_first'` is left out of the time-to-song clock.
 */

import {
  appendCreateStyleHints,
  parseFeelList,
  type Energy,
  type FeelLabel,
} from '@/lib/create/songOptions';

export const BEAT_FIRST_PATH = 'beat_first' as const;

/** Extra beats after the first. The first beat is not a retry. */
export const BEAT_RETRY_CAP = 2;

/**
 * One instrumental plus one Sing Over. Two free beat retries are the worst
 * case (three instrumentals plus one Sing Over), about $0.16.
 */
export const BEAT_FIRST_TARGET_USD = 0.085;
export const BEAT_FIRST_WORST_USD = 0.16;

export const HEAR_BEAT_FIRST_LABEL = 'Hear the beat first';
export const HEAR_BEAT_FIRST_HINT = 'Takes a few extra minutes';
export const ADD_VOCALS_LABEL = 'Add vocals';
export const CHANGE_THE_FEEL_LABEL = 'Change the feel';
export const USE_AS_IS_LABEL = 'Use as is, no vocals';
export const BEAT_READY_STUDIO_LABEL = 'Beat ready · Add vocals';
export const ADDING_VOCALS_LABEL = 'Adding vocals';
export const MAKING_BEAT_LABEL = 'Making your beat…';
export const NO_BEATS_LEFT_LABEL = 'No beats left';

export const BEAT_FIRST_EVENTS = [
  'beat_first_started',
  'beat_regenerated',
  'beat_picked',
  'vocals_added',
  'used_as_instrumental',
] as const;

export type BeatStage = 'generating' | 'ready' | 'singing' | 'vocals' | 'instrumental';

export type BeatFirstState = {
  stage: BeatStage;
  retriesUsed: number;
  chosenVersionId?: string | null;
  vocalsAdded?: boolean;
};

const MAX_ELAPSED_MS = 30 * 24 * 60 * 60 * 1000;

/** Studio song form only. Hidden on the first-artist create and on instrumental. */
export function showHearBeatFirst(input: { firstArtist: boolean; instrumental: boolean }): boolean {
  return input.firstArtist !== true && input.instrumental !== true;
}

export function retriesLeft(used: number): number {
  if (!Number.isFinite(used) || used <= 0) return BEAT_RETRY_CAP;
  return Math.max(0, BEAT_RETRY_CAP - Math.floor(used));
}

export function tryAnotherBeatLabel(used: number): string {
  const left = retriesLeft(used);
  if (left <= 0) return NO_BEATS_LEFT_LABEL;
  return `Try another beat (${left} left)`;
}

/** Ice action inside the feel sheet. Disabled when no retries remain. */
export function makeNewBeatLabel(used: number): string {
  return `Make a new beat (${retriesLeft(used)} left)`;
}

/** The next retriesUsed value, or null when the cap is already spent. */
export function nextBeatRetry(used: number): number | null {
  if (retriesLeft(used) <= 0) return null;
  const current = Number.isFinite(used) && used > 0 ? Math.floor(used) : 0;
  return current + 1;
}

export function beatRetryInFlight(stage: unknown): boolean {
  return stage === 'generating' || stage === 'singing';
}

/**
 * Beat-first songs are not part of the 3-minute time-to-song metric.
 * Callers skip `first_song_ready` (and its elapsedMs) when this is false.
 */
export function countsTowardTimeToSong(path: unknown): boolean {
  return path !== BEAT_FIRST_PATH;
}

export function msFromFirstBeat(firstBeatAtMs: number | null, nowMs: number): number | null {
  if (firstBeatAtMs == null || !Number.isFinite(firstBeatAtMs) || !Number.isFinite(nowMs)) return null;
  const elapsed = Math.round(nowMs - firstBeatAtMs);
  if (!Number.isInteger(elapsed) || elapsed < 0 || elapsed > MAX_ELAPSED_MS) return null;
  return elapsed;
}

export function studioBeatLabel(song: {
  path?: unknown;
  audioReady?: unknown;
  beatFirst?: { stage?: unknown } | null;
}): string | null {
  if (song.path !== BEAT_FIRST_PATH) return null;
  if (song.audioReady === true) return null;
  const stage = song.beatFirst?.stage;
  if (stage === 'ready') return BEAT_READY_STUDIO_LABEL;
  if (stage === 'singing') return ADDING_VOCALS_LABEL;
  return null;
}

export function unfinishedBeat(song: {
  path?: unknown;
  audioReady?: unknown;
  beatFirst?: { stage?: unknown } | null;
}): boolean {
  if (song.path !== BEAT_FIRST_PATH || song.audioReady === true) return false;
  const stage = song.beatFirst?.stage;
  return stage === 'generating' || stage === 'ready' || stage === 'singing';
}

/**
 * Style sent as MusicGPT `music_style` for the beat, and as Sing Over `prompt`.
 * Feel and energy are always included. They are the panel's picks, not only
 * the ones that differ from the artist.
 */
export function beatDirection(input: {
  musicStyle?: string | null;
  feel?: readonly string[] | null;
  energy?: string | null;
}): string {
  return (
    appendCreateStyleHints(input.musicStyle?.trim() || undefined, {
      feel: input.feel ?? [],
      energy: input.energy?.trim() || null,
    }) ?? ''
  );
}

/**
 * Sing Over has one text field. The musical direction is the artist style
 * plus feel and energy. The owner's song idea is appended when they typed
 * one, so the vocal still follows that idea.
 */
export function singOverPromptText(input: {
  musicStyle?: string | null;
  feel?: readonly string[] | null;
  energy?: string | null;
  idea?: string | null;
}): string {
  const direction = beatDirection(input);
  const idea = input.idea?.trim() ?? '';
  if (!idea) return direction;
  if (!direction) return idea;
  if (direction.includes(idea)) return direction;
  const combined = `${direction}. ${idea}`;
  return combined.length <= 1000 ? combined : combined.slice(0, 1000).trimEnd();
}

export function lyricsNeeded(words: unknown, lyrics: unknown): boolean {
  if (words === 'mine' && typeof lyrics === 'string' && lyrics.trim().length > 0) return false;
  return true;
}

/** Owner catalog label. Null when this tile should use the normal card. */
export function holdBeatPublish(input: {
  path?: unknown;
  job?: unknown;
  stage?: unknown;
}): boolean {
  if (input.path !== BEAT_FIRST_PATH || input.job !== 'beat') return false;
  return input.stage !== 'vocals' && input.stage !== 'instrumental';
}

export type AudioJob = 'beat' | 'sing_over';

export function readAudioJob(...candidates: unknown[]): AudioJob | null {
  for (const value of candidates) {
    if (value === 'beat' || value === 'sing_over') return value;
  }
  return null;
}

export function addCredit(current: number | null | undefined, next: number | null): number | null {
  const base = typeof current === 'number' && Number.isFinite(current) ? current : 0;
  if (next == null || !Number.isFinite(next)) return current ?? null;
  return Math.round((base + next) * 1000) / 1000;
}

export type SingOverAccount = {
  attempts: number;
  creditEstimate: number | null;
};

/**
 * Generic Sing Over cap. `cap` null means the caller is not limiting attempts.
 * Beat-first does not pass a vocal cap. A later re-sing can.
 */
export function accountSingOver(
  current: SingOverAccount | null | undefined,
  credit: number | null,
  cap: number | null
): { ok: true; account: SingOverAccount } | { ok: false; reason: 'cap' } {
  const attempts = current?.attempts ?? 0;
  if (cap != null && attempts >= cap) return { ok: false, reason: 'cap' };
  return {
    ok: true,
    account: {
      attempts: attempts + 1,
      creditEstimate: addCredit(current?.creditEstimate, credit),
    },
  };
}

export function feelEnergyFromSong(song: {
  createOptions?: { feel?: readonly string[] | null; energy?: string | null } | null;
}): { feel: FeelLabel[]; energy: Energy | null } {
  const feel = parseFeelList(song.createOptions?.feel ?? []);
  const energy = song.createOptions?.energy;
  const parsed: Energy | null =
    energy === 'Slow' || energy === 'Steady' || energy === 'Fast' ? energy : null;
  return { feel, energy: parsed };
}

/** Server-safe. Do not export this from a client module; the song page calls it. */
export function beatFeelFromOptions(song: {
  createOptions?: { feel?: readonly string[] | null; energy?: string | null } | null;
}): { feel: FeelLabel[]; energy: Energy } {
  const parsed = feelEnergyFromSong(song);
  return { feel: parsed.feel, energy: parsed.energy ?? 'Steady' };
}
