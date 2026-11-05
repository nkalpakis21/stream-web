/**
 * Cost and duration for one finished MusicGPT song.
 * Written onto the generation doc and logged as `musicgpt_generation_complete`.
 */

import type { MusicGptUsageRecord } from '@/types/firestore';

const CREDIT_KEYS = ['credit_estimate', 'creditEstimate', 'credits_estimate'] as const;
const CHARGED_KEYS = [
  'charged_cost',
  'chargedCost',
  'cost',
  'credits_used',
  'credit_used',
  'amount_charged',
] as const;

export function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readFirstNumber(
  source: Record<string, unknown> | null | undefined,
  keys: readonly string[]
): number | null {
  if (!source) return null;
  for (const key of keys) {
    const parsed = readFiniteNumber(source[key]);
    if (parsed != null) return parsed;
  }
  return null;
}

function firstNumber(
  sources: Array<Record<string, unknown> | null | undefined>,
  keys: readonly string[]
): number | null {
  for (const source of sources) {
    const parsed = readFirstNumber(source, keys);
    if (parsed != null) return parsed;
  }
  return null;
}

function readNonEmptyString(
  source: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  if (!source) return null;
  const value = source[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function readMusicGptCreditEstimate(
  source: Record<string, unknown> | null | undefined
): number | null {
  return readFirstNumber(source, CREDIT_KEYS);
}

export function musicGptDurationMs(
  startedAtMs: number | null,
  completedAtMs: number
): number | null {
  if (startedAtMs == null || !Number.isFinite(startedAtMs) || !Number.isFinite(completedAtMs)) {
    return null;
  }
  if (completedAtMs < startedAtMs) return null;
  return completedAtMs - startedAtMs;
}

/**
 * credit_estimate prefers the webhook, then byId, then the create response
 * stored on the generation, then the task binding. Charged cost is only taken
 * from the webhook or byId so an estimate is not reported as the amount billed.
 */
export function resolveMusicGptUsageNumbers(input: {
  webhook?: Record<string, unknown> | null;
  conversion?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  bindingCreditEstimate?: number | null;
  bindingModel?: string | null;
  bindingApiVersion?: 'v1' | 'v2' | null;
}): {
  creditEstimate: number | null;
  chargedCost: number | null;
  model: string | null;
  apiVersion: 'v1' | 'v2' | null;
} {
  const creditEstimate =
    firstNumber([input.webhook, input.conversion, input.metadata], CREDIT_KEYS) ??
    (typeof input.bindingCreditEstimate === 'number' && Number.isFinite(input.bindingCreditEstimate)
      ? input.bindingCreditEstimate
      : null);

  return {
    creditEstimate,
    chargedCost: firstNumber([input.webhook, input.conversion], CHARGED_KEYS),
    model:
      readNonEmptyString(input.webhook, 'model') ??
      readNonEmptyString(input.conversion, 'model') ??
      (input.bindingModel?.trim() || null),
    apiVersion: input.bindingApiVersion ?? null,
  };
}

export function logMusicGptUsage(record: MusicGptUsageRecord): void {
  console.log(
    `musicgpt_generation_complete ${JSON.stringify({
      event: 'musicgpt_generation_complete',
      ...record,
    })}`
  );
}

function normalizeSubtype(subtype: string | undefined): string {
  return (subtype ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function isMusicGptStreamingSubtype(subtype: string | undefined): boolean {
  const normalized = normalizeSubtype(subtype);
  return (
    normalized === 'audio_streaming' ||
    normalized === 'audio_stream' ||
    normalized === 'streaming' ||
    normalized === 'stream'
  );
}

/**
 * Streaming webhooks have a playable URL and no final conversion_path.
 * A completion payload that also carries a stream URL is not this event.
 */
export function isMusicGptAudioStreamingEvent(body: {
  subtype?: string;
  streaming_url?: unknown;
  conversion_path?: unknown;
}): boolean {
  if (typeof body.conversion_path === 'string' && body.conversion_path.trim()) return false;
  if (isMusicGptStreamingSubtype(body.subtype)) return true;
  return typeof body.streaming_url === 'string' && body.streaming_url.trim().length > 0;
}

/** https URL only, with userinfo removed. Null means ignore, not reject the webhook. */
export function safeMusicGptStreamingUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  url.username = '';
  url.password = '';
  return url.toString();
}
