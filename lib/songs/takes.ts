/**
 * Two MusicGPT takes on one song.
 * Take 1 is conversion id 0 and stays current until the owner picks otherwise.
 * Fans are only handed the current version.
 */

export const PICK_TAKE_TITLE = 'Pick your favorite take';
export const TAKE_1_LABEL = 'Take 1';
export const TAKE_2_LABEL = 'Take 2';
export const CURRENT_TAKE_LABEL = 'Current';
export const USE_TAKE_LABEL = 'Use this take';
export const SWITCHING_TAKE_LABEL = 'Switching…';
export const SWITCH_TAKE_ERROR = "Couldn't switch takes.";
export const TAKE_2_PENDING = 'Take 2 is still coming…';
export const TAKE_2_FAILED = "Take 2 didn't come through.";
export const SWITCH_TAKE_LABEL = 'Switch take';

export type TakeNumber = 1 | 2;
export type TakeStatus = 'ready' | 'pending' | 'failed';

export interface TakeVersionRef {
  id: string;
  audioURL?: string | null;
  providerOutputId?: string | null;
  isPrimary?: boolean;
  versionNumber?: number;
}

export interface TakeGenerationRef {
  provider?: string | null;
  status?: string | null;
  providerConversionIds?: string[] | null;
  providerFailedConversions?: string[] | null;
  createdAtMs?: number | null;
}

export interface TakeSeed {
  currentVersionId: string;
  conversionIds: string[];
  failedConversionIds: string[];
  generationStatus: string | null;
  versions: TakeVersionRef[];
}

export interface TakeSlot {
  take: TakeNumber;
  label: typeof TAKE_1_LABEL | typeof TAKE_2_LABEL;
  status: TakeStatus;
  versionId: string | null;
  audioUrl: string | null;
  isCurrent: boolean;
}

export function takeAudioUrl(version: { audioURL?: string | null }): string | null {
  const url = typeof version.audioURL === 'string' ? version.audioURL.trim() : '';
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

export function generationTakeInput(generation: {
  provider?: string | null;
  status?: string | null;
  providerConversionIds?: string[] | null;
  providerFailedConversions?: string[] | null;
  createdAt?: unknown;
}): TakeGenerationRef {
  return {
    provider: generation.provider ?? null,
    status: generation.status ?? null,
    providerConversionIds: generation.providerConversionIds ?? null,
    providerFailedConversions: generation.providerFailedConversions ?? null,
    createdAtMs: millisOf(generation.createdAt),
  };
}

/** Latest MusicGPT generation that named at least one conversion. */
export function takeSeedFromParts(input: {
  currentVersionId: string;
  versions: readonly TakeVersionRef[];
  generations: readonly TakeGenerationRef[];
}): TakeSeed | null {
  const candidates = input.generations
    .filter(
      (generation) =>
        (generation.provider == null || generation.provider === 'musicgpt') &&
        (generation.providerConversionIds?.length ?? 0) > 0
    )
    .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
  const generation = candidates[0];
  if (!generation) return null;
  return {
    currentVersionId: input.currentVersionId,
    conversionIds: (generation.providerConversionIds ?? []).map((id) => id.trim()).filter(Boolean),
    failedConversionIds: (generation.providerFailedConversions ?? [])
      .map((id) => id.trim())
      .filter(Boolean),
    generationStatus: generation.status ?? null,
    versions: [...input.versions],
  };
}

export function buildTakeSlots(seed: TakeSeed | null): [TakeSlot, TakeSlot] | null {
  if (!seed || seed.conversionIds.length === 0) return null;
  const failed = new Set(seed.failedConversionIds);
  const slots = ([1, 2] as const).map((take) => {
    const conversionId = seed.conversionIds[take - 1] ?? '';
    const version = conversionId
      ? seed.versions.find(
          (item) => item.providerOutputId === conversionId && takeAudioUrl(item)
        )
      : undefined;
    let status: TakeStatus = 'pending';
    if (version) status = 'ready';
    else if ((conversionId && failed.has(conversionId)) || (!conversionId && seed.generationStatus === 'failed')) {
      status = 'failed';
    }
    const audioUrl = version ? takeAudioUrl(version) : null;
    return {
      take,
      label: take === 1 ? TAKE_1_LABEL : TAKE_2_LABEL,
      status,
      versionId: version?.id ?? null,
      audioUrl,
      isCurrent: false,
    };
  }) as [TakeSlot, TakeSlot];

  const byCurrent = slots.find((slot) => slot.versionId && slot.versionId === seed.currentVersionId);
  if (byCurrent) byCurrent.isCurrent = true;
  else {
    const primary = seed.versions.find((version) => version.isPrimary && takeAudioUrl(version));
    const byPrimary = primary ? slots.find((slot) => slot.versionId === primary.id) : undefined;
    if (byPrimary) byPrimary.isCurrent = true;
    else if (slots[0].status === 'ready') slots[0].isCurrent = true;
  }
  return slots;
}

export function shouldShowTakePicker(slots: [TakeSlot, TakeSlot] | null): boolean {
  return Boolean(slots?.some((slot) => slot.status === 'ready'));
}

/**
 * Studio "Switch take" is for a song that has two takes.
 * Two conversion ids count even while Take 2 is still on the way.
 * Otherwise two versions with audio or a provider id count.
 */
export function songHasTwoTakes(input: {
  conversionIds?: readonly string[] | null;
  versions?: readonly { audioURL?: string | null; providerOutputId?: string | null }[] | null;
}): boolean {
  const conversions = (input.conversionIds ?? []).filter((id) => id.trim().length > 0);
  if (conversions.length >= 2) return true;
  const versions = input.versions ?? [];
  let takeVersions = 0;
  for (const version of versions) {
    const audio = typeof version.audioURL === 'string' && version.audioURL.trim().length > 0;
    const output =
      typeof version.providerOutputId === 'string' && version.providerOutputId.trim().length > 0;
    if (audio || output) takeVersions += 1;
  }
  return takeVersions >= 2;
}

export function seedHasTwoTakes(seed: TakeSeed | null): boolean {
  if (!seed) return false;
  return songHasTwoTakes({
    conversionIds: seed.conversionIds,
    versions: seed.versions,
  });
}

/** Force the current tag onto a version the owner just picked, before the snapshot lands. */
export function slotsWithCurrent(
  slots: [TakeSlot, TakeSlot] | null,
  versionId: string | null
): [TakeSlot, TakeSlot] | null {
  if (!slots || !versionId) return slots;
  if (!slots.some((slot) => slot.versionId === versionId)) return slots;
  return slots.map((slot) => ({
    ...slot,
    isCurrent: slot.versionId === versionId,
  })) as [TakeSlot, TakeSlot];
}

/**
 * Versions a listener may be offered. The current take only.
 * An empty list leaves playback on the caller's primary URL.
 */
export function listenerVersions<T extends { id: string; audioURL?: string | null; isPrimary?: boolean }>(
  versions: readonly T[],
  currentVersionId: string | null | undefined
): T[] {
  const current = versions.find((version) => version.id === currentVersionId && takeAudioUrl(version));
  if (current) return [current];
  const primary = versions.find((version) => version.isPrimary && takeAudioUrl(version));
  return primary ? [primary] : [];
}

export function takeNumberForConversion(
  conversionIds: readonly string[],
  conversionId: string | null | undefined
): TakeNumber | null {
  if (!conversionId) return null;
  const index = conversionIds.indexOf(conversionId);
  if (index === 0) return 1;
  if (index === 1) return 2;
  return null;
}

export function changedFromDefault(take: TakeNumber): boolean {
  return take !== 1;
}

/**
 * Keep earlier conversion ids, then any version output ids in version order,
 * then the late id. Take 1 stays index 0.
 */
export function conversionIdsAfterLateTake(
  existingIds: readonly string[] | null | undefined,
  versions: readonly { providerOutputId?: string | null; versionNumber?: number }[],
  lateId: string
): string[] {
  const ordered: string[] = [];
  const push = (id: string | null | undefined) => {
    if (typeof id !== 'string') return;
    const trimmed = id.trim();
    if (!trimmed || ordered.includes(trimmed)) return;
    ordered.push(trimmed);
  };
  for (const id of existingIds ?? []) push(id);
  const fromVersions = [...versions].sort(
    (a, b) => (a.versionNumber ?? 0) - (b.versionNumber ?? 0)
  );
  for (const version of fromVersions) push(version.providerOutputId);
  push(lateId);
  return ordered;
}
