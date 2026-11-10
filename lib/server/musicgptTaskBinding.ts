/**
 * Binds a MusicGPT task id to the user who started it.
 *
 * Generations are readable on public songs, so providerTaskId is not a secret.
 * The webhook trusts musicgptTasks/{taskId} (Admin SDK only) instead of the
 * first generation that copied the id.
 *
 * Enable a Firestore TTL policy on musicgptTasks.expireAt. Deletion is not
 * instant; the webhook does not honor expireAt itself.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { adminGetSong } from '@/lib/server/songsAdmin';
import type { GenerationDocument } from '@/types/firestore';
import { musicGptWebhookSecret } from '@/lib/webhooks/musicgptAuth';
import { redactForLog } from '@/lib/webhooks/redactUrl';

/** Binding docs are eligible for TTL deletion after 7 days. */
export const MUSICGPT_TASK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Generations time out at 8 minutes. An unbound task is accepted only when
 * exactly one generation matches and its createdAt is less than this long
 * before the webhook arrives.
 *
 * TODO: remove the unbound legacy fallback after the promote.
 */
export const LEGACY_UNBOUND_WINDOW_MS = 15 * 60 * 1000;

export type MusicGptTaskBinding = {
  uid: string;
  songId: string | null;
  conversionIds: string[];
  createdAt: unknown;
  expireAt: unknown;
  /** Model sent on the create call. v1 rollback leaves this null. */
  model?: string | null;
  apiVersion?: 'v1' | 'v2';
  /** credit_estimate from the MusicAI create response, when the API sends one. */
  creditEstimate?: number | null;
  /**
   * Client that started the task. Missing on older bindings, which the
   * webhook records as `unknown`.
   */
  platform?: 'web' | 'ios' | 'unknown';
  /**
   * `beat` is an instrumental pass. `sing_over` sings on source audio.
   * Absent on a normal MusicAI song. Admin SDK only.
   */
  job?: 'beat' | 'sing_over';
};

export type GenerationCandidate = {
  id: string;
  generation: GenerationDocument;
  songOwnerId: string | null;
};

export type MusicGptResolution = {
  accepted: GenerationCandidate | null;
  /** No binding doc, and the legacy single-generation fallback does not apply. */
  logUnbound: boolean;
  /** A generation with this task id failed the binding check. */
  logMismatch: boolean;
  mode: 'bound' | 'legacy' | 'none';
};

export type AuthorizedMusicGptGeneration =
  | { ok: true; generation: GenerationDocument; mode: 'bound' | 'legacy' }
  | { ok: false; reason: 'unbound' | 'mismatch' | 'missing' };

export function musicGptTaskLogId(taskId: string): string {
  const redacted = redactForLog(taskId, musicGptWebhookSecret());
  return typeof redacted === 'string' ? redacted : String(taskId);
}

export function timestampMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
  if (typeof record.toMillis === 'function') {
    try {
      const ms = record.toMillis();
      return Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }
  const seconds = typeof record.seconds === 'number' ? record.seconds : record._seconds;
  if (typeof seconds === 'number' && Number.isFinite(seconds)) return Math.round(seconds * 1000);
  return null;
}

/** True when createdAt is strictly less than 15 minutes before `nowMs`. */
export function isWithinLegacyUnboundWindow(createdAt: unknown, nowMs: number): boolean {
  const ms = timestampMillis(createdAt);
  if (ms == null) return false;
  const ageMs = nowMs - ms;
  return ageMs >= 0 && ageMs < LEGACY_UNBOUND_WINDOW_MS;
}

export function readMusicGptTaskBinding(data: unknown): MusicGptTaskBinding | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (typeof record.uid !== 'string' || record.uid.length === 0) return null;

  let songId: string | null;
  if (record.songId == null) {
    songId = null;
  } else if (typeof record.songId === 'string') {
    const trimmed = record.songId.trim();
    songId = trimmed || null;
  } else {
    return null;
  }

  const conversionIds = Array.isArray(record.conversionIds)
    ? record.conversionIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];

  const binding: MusicGptTaskBinding = {
    uid: record.uid,
    songId,
    conversionIds,
    createdAt: record.createdAt,
    expireAt: record.expireAt,
  };

  if (typeof record.model === 'string') {
    const model = record.model.trim();
    if (model) binding.model = model;
  } else if (record.model === null) {
    binding.model = null;
  }

  if (record.apiVersion === 'v1' || record.apiVersion === 'v2') {
    binding.apiVersion = record.apiVersion;
  }

  if (typeof record.creditEstimate === 'number' && Number.isFinite(record.creditEstimate)) {
    binding.creditEstimate = record.creditEstimate;
  }

  if (record.platform === 'web' || record.platform === 'ios' || record.platform === 'unknown') {
    binding.platform = record.platform;
  }

  if (record.job === 'beat' || record.job === 'sing_over') {
    binding.job = record.job;
  }

  return binding;
}

function matchesBinding(
  candidate: GenerationCandidate,
  binding: MusicGptTaskBinding,
  taskId: string
): boolean {
  if (candidate.generation.providerTaskId !== taskId) return false;
  if (candidate.songOwnerId !== binding.uid) return false;
  if (binding.songId) return candidate.generation.songId === binding.songId;
  return true;
}

/**
 * Pick the generation a webhook may write.
 * A binding doc wins. Without one, a single generation created less than
 * LEGACY_UNBOUND_WINDOW_MS before `nowMs` is the legacy path.
 * Anything else unbound is a no-op.
 */
export function resolveMusicGptGeneration(input: {
  taskId: string;
  binding: MusicGptTaskBinding | null;
  bindingDocPresent: boolean;
  candidates: readonly GenerationCandidate[];
  nowMs?: number;
}): MusicGptResolution {
  const nowMs = input.nowMs ?? Date.now();
  const taskMatches = input.candidates.filter(
    (candidate) => candidate.generation.providerTaskId === input.taskId
  );

  if (!input.binding) {
    const lone = taskMatches.length === 1 ? taskMatches[0] : null;
    // TODO: remove the unbound legacy fallback after the promote.
    if (
      !input.bindingDocPresent &&
      lone &&
      isWithinLegacyUnboundWindow(lone.generation.createdAt, nowMs)
    ) {
      return { accepted: lone, logUnbound: false, logMismatch: false, mode: 'legacy' };
    }
    if (input.bindingDocPresent) {
      return { accepted: null, logUnbound: false, logMismatch: true, mode: 'none' };
    }
    return { accepted: null, logUnbound: true, logMismatch: false, mode: 'none' };
  }

  const accepted: GenerationCandidate[] = [];
  let mismatch = false;
  for (const candidate of taskMatches) {
    if (matchesBinding(candidate, input.binding, input.taskId)) {
      accepted.push(candidate);
    } else {
      mismatch = true;
    }
  }

  if (accepted.length === 0) {
    return {
      accepted: null,
      logUnbound: false,
      logMismatch: mismatch,
      mode: 'none',
    };
  }

  return {
    accepted: accepted[0],
    logUnbound: false,
    logMismatch: mismatch,
    mode: 'bound',
  };
}

export function musicGptTaskBindingFields(input: {
  uid: string;
  songId: string | null;
  conversionIds: string[];
  nowMs?: number;
  model?: string | null;
  apiVersion?: 'v1' | 'v2';
  creditEstimate?: number | null;
  platform?: 'web' | 'ios' | 'unknown';
  job?: 'beat' | 'sing_over';
}): {
  uid: string;
  songId: string | null;
  conversionIds: string[];
  createdAt: Timestamp;
  expireAt: Timestamp;
  model?: string | null;
  apiVersion?: 'v1' | 'v2';
  creditEstimate?: number;
  platform?: 'web' | 'ios' | 'unknown';
  job?: 'beat' | 'sing_over';
} {
  const nowMs = input.nowMs ?? Date.now();
  return {
    uid: input.uid,
    songId: input.songId,
    conversionIds: input.conversionIds,
    createdAt: Timestamp.fromMillis(nowMs),
    expireAt: Timestamp.fromMillis(nowMs + MUSICGPT_TASK_TTL_MS),
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(input.apiVersion ? { apiVersion: input.apiVersion } : {}),
    ...(typeof input.creditEstimate === 'number' && Number.isFinite(input.creditEstimate)
      ? { creditEstimate: input.creditEstimate }
      : {}),
    ...(input.platform === 'web' || input.platform === 'ios' || input.platform === 'unknown'
      ? { platform: input.platform }
      : {}),
    ...(input.job === 'beat' || input.job === 'sing_over' ? { job: input.job } : {}),
  };
}

export async function saveMusicGptTaskBinding(input: {
  taskId: string;
  uid: string;
  songId: string | null;
  conversionIds: string[];
  nowMs?: number;
  model?: string | null;
  apiVersion?: 'v1' | 'v2';
  creditEstimate?: number | null;
  platform?: 'web' | 'ios' | 'unknown';
  job?: 'beat' | 'sing_over';
}): Promise<void> {
  if (!input.taskId) {
    throw new Error('MusicGPT task id is required');
  }
  await getAdminDb()
    .collection(COLLECTIONS.musicgptTasks)
    .doc(input.taskId)
    .set(musicGptTaskBindingFields(input));
}

export async function findAuthorizedMusicGptGeneration(
  taskId: string
): Promise<AuthorizedMusicGptGeneration> {
  const db = getAdminDb();
  const bindingSnap = await db.collection(COLLECTIONS.musicgptTasks).doc(taskId).get();
  const binding = bindingSnap.exists ? readMusicGptTaskBinding(bindingSnap.data()) : null;

  const snap = await db
    .collection(COLLECTIONS.generations)
    .where('providerTaskId', '==', taskId)
    .get();

  const candidates: GenerationCandidate[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as GenerationDocument;
    const generation: GenerationDocument = { ...data, id: doc.id };
    const song = generation.songId ? await adminGetSong(generation.songId) : null;
    candidates.push({
      id: doc.id,
      generation,
      songOwnerId: song?.ownerId ?? null,
    });
  }

  const resolution = resolveMusicGptGeneration({
    taskId,
    binding,
    bindingDocPresent: bindingSnap.exists,
    candidates,
  });

  if (resolution.logUnbound) {
    console.warn(`musicgpt_task_unbound ${musicGptTaskLogId(taskId)}`);
  }
  if (resolution.logMismatch) {
    console.warn(`musicgpt_task_mismatch ${musicGptTaskLogId(taskId)}`);
  }

  if (!resolution.accepted) {
    if (resolution.logUnbound) return { ok: false, reason: 'unbound' };
    if (resolution.logMismatch) return { ok: false, reason: 'mismatch' };
    return { ok: false, reason: 'missing' };
  }

  return {
    ok: true,
    generation: resolution.accepted.generation,
    mode: resolution.mode === 'legacy' ? 'legacy' : 'bound',
  };
}

export async function getMusicGptTaskBinding(taskId: string): Promise<MusicGptTaskBinding | null> {
  const snap = await getAdminDb().collection(COLLECTIONS.musicgptTasks).doc(taskId).get();
  if (!snap.exists) return null;
  return readMusicGptTaskBinding(snap.data());
}
