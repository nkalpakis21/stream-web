/**
 * One create attempt shares a client idempotency key. A second attempt with
 * that key, from the same owner, inside the window, gets the same song.
 * Outside the window, or after the song is soft-deleted, the next attempt
 * uses a new document id.
 */

export const SONG_CREATE_IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

export function isSongCreateIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && KEY_PATTERN.test(value);
}

/** Stable song id for a key. Null when the key cannot be used as an id. */
export function songCreateDocumentId(ownerId: string, idempotencyKey: string): string | null {
  if (!isSongCreateIdempotencyKey(idempotencyKey)) return null;
  const owner = ownerId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  if (!owner) return null;
  return `c_${owner}_${idempotencyKey}`;
}

export class SongCreateIdTaken extends Error {
  constructor() {
    super('Song create id taken');
    this.name = 'SongCreateIdTaken';
  }
}

/** Thrown by the create attempt. `keepIdempotencyKey` means the next click should reuse it. */
export class SongCreateFailed extends Error {
  readonly keepIdempotencyKey: boolean;
  /** `generation` is a MusicGPT failure. `create` is everything before that. */
  readonly stage: 'create' | 'generation';

  constructor(cause: unknown, keepIdempotencyKey: boolean, stage: 'create' | 'generation' = 'create') {
    super(cause instanceof Error ? cause.message : 'Failed to create song');
    this.name = 'SongCreateFailed';
    this.keepIdempotencyKey = keepIdempotencyKey;
    this.stage = stage;
  }
}

export interface SongCreateIdentity {
  ownerId: string;
  deletedAt?: unknown;
  createdAtMs: number;
}

export function songCreateReuseDecision(
  existing: SongCreateIdentity | null,
  ownerId: string,
  nowMs: number,
  windowMs: number = SONG_CREATE_IDEMPOTENCY_WINDOW_MS
): 'reuse' | 'fresh' {
  if (!existing) return 'fresh';
  if (existing.ownerId !== ownerId) return 'fresh';
  if (existing.deletedAt != null) return 'fresh';
  if (!Number.isFinite(existing.createdAtMs) || !Number.isFinite(nowMs)) return 'fresh';
  if (nowMs - existing.createdAtMs > windowMs) return 'fresh';
  if (existing.createdAtMs - nowMs > 60_000) return 'fresh';
  return 'reuse';
}

export async function commitIdempotentSongCreate<T>(
  db: {
    get(id: string): Promise<T | null>;
    insert(song: T): Promise<void>;
    newId(): string;
  },
  args: {
    ownerId: string;
    idempotencyKey: string | null;
    nowMs: number;
    identity: (song: T) => SongCreateIdentity;
    build: (id: string) => T;
  }
): Promise<{ song: T; reused: boolean }> {
  const deterministic = args.idempotencyKey
    ? songCreateDocumentId(args.ownerId, args.idempotencyKey)
    : null;

  const reusable = (song: T | null): song is T =>
    !!song && songCreateReuseDecision(args.identity(song), args.ownerId, args.nowMs) === 'reuse';

  if (deterministic) {
    const existing = await db.get(deterministic);
    if (reusable(existing)) return { song: existing, reused: true };
    if (!existing) {
      const song = args.build(deterministic);
      try {
        await db.insert(song);
        return { song, reused: false };
      } catch (error) {
        if (!(error instanceof SongCreateIdTaken)) throw error;
        const raced = await db.get(deterministic);
        if (reusable(raced)) return { song: raced, reused: true };
      }
    }
  }

  const song = args.build(db.newId());
  await db.insert(song);
  return { song, reused: false };
}

/**
 * Create the song, then the generation. If the generation fails and this
 * attempt created the song, soft-delete that shell. A reused song is left
 * alone so a duplicate submit cannot delete the in-flight one.
 */
export async function runSongCreateAttempt(deps: {
  createSong: () => Promise<{ id: string; reused: boolean }>;
  createGeneration: (songId: string) => Promise<void>;
  abandon: (songId: string) => Promise<boolean>;
}): Promise<{ id: string; reused: boolean }> {
  let created: { id: string; reused: boolean } | null = null;
  try {
    created = await deps.createSong();
    await deps.createGeneration(created.id);
    return created;
  } catch (error) {
    if (created && !created.reused) {
      let removed = false;
      try {
        removed = await deps.abandon(created.id);
      } catch {
        removed = false;
      }
      throw new SongCreateFailed(error, !removed, 'generation');
    }
    throw new SongCreateFailed(error, true, created ? 'generation' : 'create');
  }
}
