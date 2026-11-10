/**
 * Funnel events on Firestore `funnelEvents`, written only by the Admin SDK.
 *
 * Client Firebase Analytics records page views and CTA clicks. It cannot see
 * the MusicGPT webhook. First-time milestones use doc id `${uid}_${event}`
 * and create-if-absent. `play`, `song_shared`, `x_post`, `create_options_used`,
 * `take_picked`, `voice_change`, and the beat-first events are a new auto-id doc each time.
 * `x_post`, `create_options_used`, `take_picked`, `voice_change`, and the beat-first events
 * are server-only. `platform` is
 * `web`, `ios`, or `unknown` (`lib/funnel/platform.ts`).
 * Anonymous share-page plays are auto-id docs with `uid: null`, `visitorId`,
 * and `source: 'share_page'`. Signed-in plays from that page set the same source.
 */

import { waitUntil } from '@vercel/functions';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAdminDb, isFirebaseAdminConfigured } from '@/lib/firebase/admin';
import { canonicalVisitorId } from '@/lib/analytics/visitorId';
import {
  platformFromRequest,
  type FunnelPlatform,
} from '@/lib/funnel/platform';

export { platformFromRequest, type FunnelPlatform };

export const FIRST_FUNNEL_EVENTS = [
  'signed_up',
  'create_started',
  'artist_created',
  'face_set',
  'create_submitted',
  'first_song_started',
  'first_song_ready',
  'x_connected',
] as const;

export const REPEAT_FUNNEL_EVENTS = [
  'play',
  'song_shared',
  'x_post',
  'create_options_used',
  'take_picked',
  'beat_first_started',
  'beat_regenerated',
  'beat_picked',
  'vocals_added',
  'used_as_instrumental',
  'voice_change',
] as const;

/**
 * Repeat events the browser may report. `x_post`, `create_options_used`,
 * `take_picked`, `voice_change`, and the beat-first events stay server-only.
 */
const CLIENT_REPEAT_EVENTS = ['play', 'song_shared'] as const;

export const FUNNEL_EVENTS = [...FIRST_FUNNEL_EVENTS, ...REPEAT_FUNNEL_EVENTS] as const;

export type FirstFunnelEvent = (typeof FIRST_FUNNEL_EVENTS)[number];
export type RepeatFunnelEvent = (typeof REPEAT_FUNNEL_EVENTS)[number];
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/**
 * Signed-in browser actions. create_started, face_set, and create_submitted
 * are first-time milestones. play and song_shared are written every time.
 * Everything else is server-side. Anonymous callers may only report a
 * share-page play.
 */
export const CLIENT_CREATE_EVENTS = ['create_started', 'face_set', 'create_submitted'] as const;

export const CLIENT_FUNNEL_EVENTS = [...CLIENT_CREATE_EVENTS, ...CLIENT_REPEAT_EVENTS] as const;

export type ClientCreateEvent = (typeof CLIENT_CREATE_EVENTS)[number];
export type ClientFunnelEvent = (typeof CLIENT_FUNNEL_EVENTS)[number];

export const FACE_SET_METHODS = ['upload', 'generate'] as const;
export const CREATE_SUBMITTED_FACES = ['upload', 'generate', 'none'] as const;

export type FaceSetMethod = (typeof FACE_SET_METHODS)[number];
export type CreateSubmittedFace = (typeof CREATE_SUBMITTED_FACES)[number];

/** Ignore another play of the same song by the same user inside this window. */
export const PLAY_REPEAT_WINDOW_MS = 30_000;

/** Anonymous share-page plays allowed per visitor and per IP in this window. */
export const ANONYMOUS_PLAY_HOUR_MS = 60 * 60 * 1000;
export const ANONYMOUS_PLAY_HOUR_MAX = 60;

export const SHARE_PAGE_SOURCE = 'share_page' as const;

/** Auth user created within this window counts as signed_up. Older sessions do not. */
export const SIGNED_UP_WINDOW_MS = 60 * 60 * 1000;

/** Artist document created within this window counts as artist_created. */
export const ARTIST_CREATED_WINDOW_MS = 2 * 60 * 60 * 1000;

const CLOCK_SKEW_MS = 5 * 60 * 1000;

const PROP_KEYS = ['artistId', 'songId', 'taskId'] as const;
const CREATE_OPTION_TAGS = ['instrumental', 'voice', 'lyrics', 'feel', 'energy'] as const;
const OPTIONS_PROP =
  /^(instrumental|voice|lyrics|feel|energy)(,(instrumental|voice|lyrics|feel|energy))*$/;
const PROP_VALUE = /^[A-Za-z0-9_-]{1,128}$/;
/** Drop a clock that is negative or longer than a month. */
const MAX_ELAPSED_MS = 30 * 24 * 60 * 60 * 1000;

export type FunnelStore = {
  create(id: string, data: Record<string, unknown>): Promise<void>;
  add(data: Record<string, unknown>): Promise<void>;
};

let testStore: FunnelStore | null = null;
let creationTimeForTests: ((uid: string) => Promise<number | null>) | null = null;

export function setFunnelStoreForTests(store: FunnelStore | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setFunnelStoreForTests is disabled in production');
  }
  testStore = store;
}

export function setFunnelCreationTimeForTests(
  lookup: ((uid: string) => Promise<number | null>) | null
): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setFunnelCreationTimeForTests is disabled in production');
  }
  creationTimeForTests = lookup;
}

export function isFunnelEvent(value: string): value is FunnelEvent {
  return (FUNNEL_EVENTS as readonly string[]).includes(value);
}

export function isFirstFunnelEvent(value: string): value is FirstFunnelEvent {
  return (FIRST_FUNNEL_EVENTS as readonly string[]).includes(value);
}

export function isClientFunnelEvent(value: string): value is ClientFunnelEvent {
  return (CLIENT_FUNNEL_EVENTS as readonly string[]).includes(value);
}

export function isFunnelPlatform(value: string): value is FunnelPlatform {
  return value === 'web' || value === 'ios' || value === 'unknown';
}

export function funnelEventDocId(uid: string, event: FirstFunnelEvent): string {
  return `${uid}_${event}`;
}

export function playRateKey(uid: string, songId: string | undefined): string {
  return `${uid}\n${songId ?? ''}`;
}

/** True when this uid already played this song inside the window. */
export function isPlayRateLimited(
  recent: ReadonlyMap<string, number>,
  uid: string,
  songId: string | undefined,
  now: number
): boolean {
  const prev = recent.get(playRateKey(uid, songId));
  return prev != null && now - prev < PLAY_REPEAT_WINDOW_MS;
}

/**
 * Keep ids, the create-flow enums, a bounded elapsedMs, create option tags,
 * take_picked fields (take, changedFromDefault, msToPick), beat-first
 * fields (retriesUsed, vocalsAdded, msFromFirstBeat), and voice_change
 * fields (voice, kept, msToKeep, source, split). Drop emails, urls,
 * skip/none on face_set, and anything else.
 */
export function sanitizeFunnelProps(
  props?: Record<string, unknown> | null
): Record<string, string | number | boolean> {
  if (!props) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const key of PROP_KEYS) {
    const value = props[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!PROP_VALUE.test(trimmed)) continue;
    out[key] = trimmed;
  }
  if (isFaceSetMethod(props.method)) out.method = props.method;
  if (isCreateSubmittedFace(props.face)) out.face = props.face;
  if (
    typeof props.elapsedMs === 'number' &&
    Number.isInteger(props.elapsedMs) &&
    props.elapsedMs >= 0 &&
    props.elapsedMs <= MAX_ELAPSED_MS
  ) {
    out.elapsedMs = props.elapsedMs;
  }
  if (typeof props.options === 'string' && OPTIONS_PROP.test(props.options)) {
    const parts = props.options.split(',');
    const unique = new Set(parts);
    const known = parts.every(part => (CREATE_OPTION_TAGS as readonly string[]).includes(part));
    if (known && unique.size === parts.length) out.options = props.options;
  }
  if (props.take === 1 || props.take === 2) out.take = props.take;
  if (typeof props.changedFromDefault === 'boolean') {
    out.changedFromDefault = props.changedFromDefault;
  }
  if (
    typeof props.msToPick === 'number' &&
    Number.isInteger(props.msToPick) &&
    props.msToPick >= 0 &&
    props.msToPick <= MAX_ELAPSED_MS
  ) {
    out.msToPick = props.msToPick;
  }
  if (
    typeof props.retriesUsed === 'number' &&
    Number.isInteger(props.retriesUsed) &&
    props.retriesUsed >= 0 &&
    props.retriesUsed <= 2
  ) {
    out.retriesUsed = props.retriesUsed;
  }
  if (typeof props.vocalsAdded === 'boolean') out.vocalsAdded = props.vocalsAdded;
  if (props.voice === 'same' || props.voice === 'female' || props.voice === 'male') {
    out.voice = props.voice;
  }
  if (typeof props.kept === 'boolean') out.kept = props.kept;
  if (props.source === 'beat_first' || props.source === 'split') out.source = props.source;
  if (typeof props.split === 'boolean') out.split = props.split;
  if (
    typeof props.msToKeep === 'number' &&
    Number.isInteger(props.msToKeep) &&
    props.msToKeep >= 0 &&
    props.msToKeep <= MAX_ELAPSED_MS
  ) {
    out.msToKeep = props.msToKeep;
  }
  if (
    typeof props.msFromFirstBeat === 'number' &&
    Number.isInteger(props.msFromFirstBeat) &&
    props.msFromFirstBeat >= 0 &&
    props.msFromFirstBeat <= MAX_ELAPSED_MS
  ) {
    out.msFromFirstBeat = props.msFromFirstBeat;
  }
  return out;
}

export function isFaceSetMethod(value: unknown): value is FaceSetMethod {
  return value === 'upload' || value === 'generate';
}

export function isCreateSubmittedFace(value: unknown): value is CreateSubmittedFace {
  return value === 'upload' || value === 'generate' || value === 'none';
}

/**
 * Signed-in create events. face_set accepts only upload or generate.
 * skip and none are rejected. create_submitted requires a face value,
 * and none is allowed there because skip is a real submit.
 */
export function clientCreateFunnelError(
  event: string,
  input: { method?: unknown; face?: unknown }
): string | null {
  if (event === 'face_set' && !isFaceSetMethod(input.method)) {
    return 'Invalid funnel event';
  }
  if (event === 'create_submitted' && !isCreateSubmittedFace(input.face)) {
    return 'Invalid funnel event';
  }
  return null;
}

export function shouldRecordSignedUp(creationTimeMs: number, nowMs: number): boolean {
  if (!Number.isFinite(creationTimeMs) || !Number.isFinite(nowMs)) return false;
  const age = nowMs - creationTimeMs;
  return age >= -CLOCK_SKEW_MS && age <= SIGNED_UP_WINDOW_MS;
}

export function artistHasFace(avatarURL: unknown): boolean {
  return typeof avatarURL === 'string' && /^https?:\/\//i.test(avatarURL.trim());
}

/**
 * Server decides the milestones. The client only names the artist it just wrote.
 * A non-owner, a deleted artist, or an old artist does not count as artist_created.
 */
export function artistFunnelPlan(input: {
  uid: string;
  ownerId: string;
  deleted: boolean;
  createdAtMs: number | null;
  hasFace: boolean;
  nowMs: number;
}): { artistCreated: boolean; faceSet: boolean } {
  if (input.deleted || !input.uid || input.uid !== input.ownerId) {
    return { artistCreated: false, faceSet: false };
  }
  const createdAtMs = input.createdAtMs;
  const artistCreated =
    createdAtMs != null &&
    Number.isFinite(createdAtMs) &&
    input.nowMs - createdAtMs >= -CLOCK_SKEW_MS &&
    input.nowMs - createdAtMs <= ARTIST_CREATED_WINDOW_MS;
  return { artistCreated, faceSet: input.hasFace };
}

export function timestampMillis(value: unknown): number | null {
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof (value as { toMillis: unknown }).toMillis === 'function'
  ) {
    const ms = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function assertUid(uid: string): string {
  const trimmed = typeof uid === 'string' ? uid.trim() : '';
  if (
    !trimmed ||
    trimmed.length > 128 ||
    trimmed === '.' ||
    trimmed === '..' ||
    /[/\s]/.test(trimmed)
  ) {
    throw new Error('Invalid funnel uid');
  }
  return trimmed;
}

function inUnitTest(): boolean {
  return process.env.NODE_TEST_CONTEXT != null;
}

function isAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === 6 || code === '6' || code === 'already-exists' || code === 'ALREADY_EXISTS') {
    return true;
  }
  const message = error instanceof Error ? error.message : '';
  return /already exists/i.test(message);
}

function adminStore(): FunnelStore {
  const collection = () => getAdminDb().collection(COLLECTIONS.funnelEvents);
  return {
    async create(id, data) {
      await collection().doc(id).create(data);
    },
    async add(data) {
      await collection().add(data);
    },
  };
}

function keepAlive(task: Promise<unknown>): void {
  try {
    waitUntil(task);
  } catch {
    // Outside a Vercel request the promise still runs on its own.
  }
}

function eventData(
  uid: string | null,
  event: FunnelEvent,
  props: Record<string, unknown> | null | undefined,
  platform: FunnelPlatform,
  extra?: { source?: typeof SHARE_PAGE_SOURCE; visitorId?: string }
): Record<string, unknown> {
  const safeProps = sanitizeFunnelProps(props);
  return {
    uid,
    event,
    at: FieldValue.serverTimestamp(),
    props: safeProps,
    platform,
    ...(extra?.source === SHARE_PAGE_SOURCE ? { source: SHARE_PAGE_SOURCE } : {}),
    ...(extra?.visitorId ? { visitorId: extra.visitorId } : {}),
    ...(extra?.visitorId && safeProps.songId ? { songId: safeProps.songId } : {}),
    ...(extra?.visitorId && safeProps.artistId ? { artistId: safeProps.artistId } : {}),
  };
}

/**
 * First-time events create `${uid}_${event}` once. `play`, `song_shared`,
 * `x_post`, `create_options_used`, `take_picked`, `voice_change`, and the beat-first events
 * always add a new doc.
 * Throws on an unknown event, platform, or uid.
 */
export async function trackFunnelEvent(
  uid: string,
  event: string,
  props?: Record<string, unknown> | null,
  platform: FunnelPlatform = 'unknown',
  source?: typeof SHARE_PAGE_SOURCE
): Promise<{ created: boolean }> {
  if (!isFunnelEvent(event)) {
    throw new Error('Invalid funnel event');
  }
  if (!isFunnelPlatform(platform)) {
    throw new Error('Invalid funnel platform');
  }
  const safeUid = assertUid(uid);
  if (inUnitTest() && !testStore) {
    return { created: false };
  }

  const shareSource = source === SHARE_PAGE_SOURCE && event === 'play' ? SHARE_PAGE_SOURCE : undefined;
  const data = eventData(safeUid, event, props, platform, shareSource ? { source: shareSource } : undefined);
  const store = testStore ?? adminStore();
  if (isFirstFunnelEvent(event)) {
    try {
      await store.create(funnelEventDocId(safeUid, event), data);
      return { created: true };
    } catch (error) {
      if (isAlreadyExists(error)) return { created: false };
      throw error;
    }
  }
  await store.add(data);
  return { created: true };
}

/**
 * Anonymous play from /songs/[id]. Auto-id. uid is null.
 * Caller has already checked the visitor id, the public song, and the rate limit.
 */
export async function trackAnonymousSharePlay(input: {
  visitorId: string;
  songId: string;
  artistId?: string | null;
  platform: FunnelPlatform;
}): Promise<{ created: boolean }> {
  if (!isFunnelPlatform(input.platform)) {
    throw new Error('Invalid funnel platform');
  }
  const visitorId = canonicalVisitorId(input.visitorId);
  if (!visitorId) {
    throw new Error('Invalid visitor');
  }
  if (inUnitTest() && !testStore) {
    return { created: false };
  }
  const store = testStore ?? adminStore();
  const data = eventData(
    null,
    'play',
    { songId: input.songId, artistId: input.artistId },
    input.platform,
    { source: SHARE_PAGE_SOURCE, visitorId }
  );
  await store.add(data);
  return { created: true };
}

/**
 * Fire-and-forget. Never throws. Does not block the caller.
 * `waitUntil` keeps the write alive after the response on Vercel.
 */
export function recordFunnelEvent(
  uid: string,
  event: FunnelEvent,
  props?: Record<string, unknown> | null,
  platform: FunnelPlatform = 'unknown'
): void {
  const task = trackFunnelEvent(uid, event, props, platform).catch(error => {
    console.error(
      '[funnel]',
      event,
      error instanceof Error ? error.message : 'failed'
    );
  });
  keepAlive(task);
}

async function lookupCreationTime(uid: string): Promise<number | null> {
  if (process.env.NODE_ENV !== 'production' && creationTimeForTests) {
    return creationTimeForTests(uid);
  }
  if (inUnitTest()) return null;
  if (!isFirebaseAdminConfigured()) return null;
  getAdminDb();
  const user = await admin.auth().getUser(uid);
  const ms = Date.parse(user.metadata.creationTime);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Record signed_up when the Auth user was created recently.
 * Called from POST /api/auth/viewer, which runs on the first signed-in load.
 * Returning users are outside the window, so they are not backfilled.
 */
export function recordSignedUp(uid: string, platform: FunnelPlatform = 'unknown'): void {
  const task = (async () => {
    try {
      const createdAtMs = await lookupCreationTime(uid);
      if (createdAtMs == null || !shouldRecordSignedUp(createdAtMs, Date.now())) return;
      await trackFunnelEvent(uid, 'signed_up', undefined, platform);
    } catch (error) {
      console.error(
        '[funnel] signed_up',
        error instanceof Error ? error.message : 'failed'
      );
    }
  })();
  keepAlive(task);
}
