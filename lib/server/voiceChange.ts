/**
 * Owner-only voice change. Admin SDK writes only.
 *
 * Reuses the shared Sing Over module: the beat is uploaded as `audio_file`,
 * lyrics come from generation metadata, and MusicGPT returns two takes.
 * Beat-first songs already have that beat. A finished normal song is split
 * first (`stem_preset=2_stems`); the instrumental is cached on the song so
 * the next change does not split again. The original version stays until
 * the owner keeps a new one. This does not create a song and does not emit
 * `first_song_started`.
 */

import { Timestamp } from 'firebase-admin/firestore';
import {
  MUSICGPT_DEFAULT_MODEL,
  buildMusicGPTStyleFromArtistContext,
  musicGptApiVersion,
} from '@/lib/ai/providers/musicgpt';
import { HttpError } from '@/lib/api/requireAuth';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAdminDb } from '@/lib/firebase/admin';
import type { FunnelPlatform } from '@/lib/funnel/platform';
import { adminGetArtist } from '@/lib/server/artistsAdmin';
import { trackFunnelEvent } from '@/lib/server/funnel';
import { getMusicGptTaskBinding, saveMusicGptTaskBinding } from '@/lib/server/musicgptTaskBinding';
import { assertNoObjectionableContent } from '@/lib/server/objectionable';
import {
  adminGetSong,
  adminGetSongGenerations,
  adminGetSongVersions,
  adminSetPrimarySongVersion,
} from '@/lib/server/songsAdmin';
import { submitSingOver } from '@/lib/server/singOver';
import { submitStemExtraction, type StemSplitResult } from '@/lib/server/stemSplit';
import { BEAT_FIRST_PATH, singOverPromptText } from '@/lib/songs/beatFirst';
import {
  STEM_SPLIT_JOB,
  VOICE_CHANGE_CAP,
  VOICE_CHANGE_PURPOSE,
  VOICE_SPLIT_PURPOSE,
  cachedSplitInstrumental,
  currentSungGender,
  isVoiceChangeGeneration,
  msBetween,
  readSongDurationSeconds,
  readVoiceChangeStatus,
  readVoiceChangeVoice,
  resolveStoredInstrumental,
  savedLyricsText,
  songIsInstrumental,
  songTooLongForSingOver,
  voiceChangeSource,
  voiceChangeSplitsBeat,
  voiceChangesLeft,
  type SungGender,
  type VoiceChangeVoice,
  type VoiceGenerationRef,
} from '@/lib/songs/voiceChange';
import { musicGptGenerationCallback } from '@/lib/webhooks/baseUrl';
import type {
  AIArtistVersionDocument,
  GenerationDocument,
  SongDocument,
  SongVersionDocument,
} from '@/types/firestore';

type TokenVerifier = (idToken: string) => Promise<{ uid: string }>;

type VoiceDeps = {
  submit?: typeof submitSingOver;
  split?: typeof submitStemExtraction;
  saveBinding?: typeof saveMusicGptTaskBinding;
  now?: () => number;
};

let depsForTests: VoiceDeps | null = null;
let verifyForTests: TokenVerifier | null = null;

export function setVoiceChangeDepsForTests(deps: VoiceDeps | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setVoiceChangeDepsForTests is disabled in production');
  }
  depsForTests = deps;
}

export function setVoiceChangeAuthForTests(verify: TokenVerifier | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setVoiceChangeAuthForTests is disabled in production');
  }
  verifyForTests = verify;
}

export function voiceChangeAuthVerifier(): TokenVerifier | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  return verifyForTests ?? undefined;
}

function deps(): VoiceDeps {
  if (process.env.NODE_ENV === 'production') return {};
  return depsForTests ?? {};
}

function generationRef(generation: GenerationDocument): VoiceGenerationRef {
  const createdAt = generation.createdAt as { toMillis?: () => number } | undefined;
  const createdAtMs = typeof createdAt?.toMillis === 'function' ? createdAt.toMillis() : null;
  return {
    id: generation.id,
    status: generation.status,
    createdAtMs,
    providerConversionIds: generation.providerConversionIds,
    providerFailedConversions: generation.providerFailedConversions,
    parameters: {
      job: generation.parameters?.job,
      purpose: generation.parameters?.purpose,
      sourceVersionId: generation.parameters?.sourceVersionId,
    },
    output: { metadata: generation.output?.metadata ?? null },
  };
}

function emptyVoice(used = 0, credit: number | null = null): NonNullable<SongDocument['voiceChange']> {
  return {
    used,
    status: null,
    voice: null,
    generationId: null,
    originalVersionId: null,
    sourceVersionId: null,
    creditEstimate: credit,
  };
}

function voiceOf(song: SongDocument): NonNullable<SongDocument['voiceChange']> {
  const current = song.voiceChange;
  return {
    used: current?.used ?? 0,
    status: readVoiceChangeStatus(current?.status),
    voice: readVoiceChangeVoice(current?.voice),
    generationId: current?.generationId ?? null,
    originalVersionId: current?.originalVersionId ?? null,
    sourceVersionId: current?.sourceVersionId ?? null,
    creditEstimate: current?.creditEstimate ?? null,
    startedAt: current?.startedAt ?? null,
  };
}

function requireCallback(): string {
  const callback = musicGptGenerationCallback();
  if (!callback.ok) throw new HttpError(callback.status, callback.error);
  return callback.webhookUrl;
}

async function loadArtistVersion(versionId: string): Promise<AIArtistVersionDocument | null> {
  if (!versionId) return null;
  const snap = await getAdminDb().collection(COLLECTIONS.artistVersions).doc(versionId).get();
  if (!snap.exists) return null;
  return snap.data() as AIArtistVersionDocument;
}

export function parseVoiceChangeRequest(raw: unknown): { voice: SungGender } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'Invalid request');
  const voice = readVoiceChangeVoice((raw as { voice?: unknown }).voice);
  if (voice !== 'female' && voice !== 'male') throw new HttpError(400, 'Pick a voice first');
  return { voice };
}

export function parseVoiceKeepRequest(raw: unknown): { versionId: string | null } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'Invalid request');
  const value = (raw as { versionId?: unknown }).versionId;
  if (value == null || value === 'original') return { versionId: null };
  if (typeof value !== 'string') throw new HttpError(400, 'versionId is invalid');
  const versionId = value.trim();
  if (!versionId || versionId.length > 128 || versionId.includes('/')) {
    throw new HttpError(400, 'versionId is invalid');
  }
  return { versionId };
}

async function ownedSong(songId: string, uid: string): Promise<SongDocument> {
  const song = await adminGetSong(songId);
  if (!song || song.deletedAt) throw new HttpError(404, 'Song not found');
  if (song.ownerId !== uid) throw new HttpError(403, 'Only the owner can change this song');
  return song;
}

type VoiceInputs = {
  lyrics: string;
  prompt: string;
  originalVersionId: string;
  mix: { versionId: string; audioUrl: string };
  artistVoice: string | null;
  durationSeconds: number | null;
  versions: SongVersionDocument[];
  generations: VoiceGenerationRef[];
};

type SingTarget = {
  /** True when a beat is already stored and Sing Over can start now. */
  singNow: boolean;
  sourceVersionId: string;
  sourceAudioUrl: string;
};

async function loadVoiceInputs(song: SongDocument): Promise<VoiceInputs> {
  if (songIsInstrumental(song)) throw new HttpError(400, 'This song is instrumental');
  const [versions, generations, artist] = await Promise.all([
    adminGetSongVersions(song.id),
    adminGetSongGenerations(song.id),
    adminGetArtist(song.artistId),
  ]);
  const generationRefs = generations.map(generationRef);
  const current = versions.find((version) => version.id === song.currentVersionId && version.audioURL?.trim());
  const lyrics = savedLyricsText(generationRefs, current?.providerOutputId ?? null);
  if (!lyrics) throw new HttpError(400, 'This song has no saved lyrics');
  const mixUrl = current?.audioURL?.trim() ?? '';
  if (!current || !mixUrl) throw new HttpError(400, 'This song has no audio to keep');
  const artistVersion = artist ? await loadArtistVersion(song.artistVersionId) : null;
  const musicStyle = artist
    ? buildMusicGPTStyleFromArtistContext({
        styleDNA: artistVersion?.styleDNA ?? artist.styleDNA,
        lore: artistVersion?.lore ?? artist.lore,
        vocalIdentity: artistVersion?.vocalIdentity ?? artist.vocalIdentity ?? null,
      }).music_style
    : '';
  const prompt = singOverPromptText({
    musicStyle,
    feel: song.createOptions?.feel ?? [],
    energy: song.createOptions?.energy ?? null,
    idea: song.createPrompt,
  });
  if (!prompt) throw new HttpError(400, 'Add a prompt first.');
  assertNoObjectionableContent(prompt, lyrics);
  const artistVoice = (artistVersion?.vocalIdentity ?? artist?.vocalIdentity ?? '').trim() || null;
  return {
    lyrics,
    prompt,
    originalVersionId: current.id,
    mix: { versionId: current.id, audioUrl: mixUrl },
    artistVoice,
    durationSeconds: readSongDurationSeconds({
      duration: song.duration,
      conversionId: current.providerOutputId ?? null,
      generations: generationRefs,
    }),
    versions,
    generations: generationRefs,
  };
}

async function singTarget(song: SongDocument, inputs: VoiceInputs): Promise<SingTarget> {
  if (song.path === BEAT_FIRST_PATH) {
    if (song.audioReady !== true) throw new HttpError(409, 'The song is not ready');
    const source = resolveStoredInstrumental({
      song,
      versions: inputs.versions,
      generations: inputs.generations,
    });
    if (!source) throw new HttpError(400, 'No separable beat for this song');
    return {
      singNow: true,
      sourceVersionId: source.versionId,
      sourceAudioUrl: source.audioUrl,
    };
  }
  if (song.audioReady === false) throw new HttpError(409, 'The song is not ready');
  if (songTooLongForSingOver(inputs.durationSeconds)) {
    throw new HttpError(400, 'This song is too long to change the voice');
  }
  const cached = cachedSplitInstrumental(song);
  if (cached) {
    return {
      singNow: true,
      sourceVersionId: cached.sourceVersionId,
      sourceAudioUrl: cached.audioUrl,
    };
  }
  return {
    singNow: false,
    sourceVersionId: inputs.mix.versionId,
    sourceAudioUrl: inputs.mix.audioUrl,
  };
}

export async function savedArtistVoice(artistId: string, versionId: string | null | undefined): Promise<string | null> {
  const artist = await adminGetArtist(artistId);
  const version = versionId ? await loadArtistVersion(versionId) : null;
  const text = (version?.vocalIdentity ?? artist?.vocalIdentity ?? '').trim();
  return text || null;
}

function clockMs(): number {
  const clock = deps().now;
  return clock ? clock() : Date.now();
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

/** Sing Over was reserved and then rejected. Give that one change back. */
async function releaseReservation(songId: string): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.songs).doc(songId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const current = voiceOf(snap.data() as SongDocument);
    if (current.status !== 'making' || current.generationId) return;
    tx.set(
      ref,
      {
        voiceChange: emptyVoice(Math.max(0, current.used - 1), current.creditEstimate),
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  });
}

/** A split was reserved in status only. No voice was produced, so the cap stays. */
async function clearMaking(songId: string): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.songs).doc(songId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const current = voiceOf(snap.data() as SongDocument);
    if (current.status !== 'making' || current.generationId) return;
    tx.set(
      ref,
      {
        voiceChange: emptyVoice(current.used, current.creditEstimate),
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  });
}

/** Async split or sing-over-before-accept failed. Show the error and do not spend a change. */
async function failVoiceChangeWithoutVoice(songId: string): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.songs).doc(songId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const current = voiceOf(snap.data() as SongDocument);
    if (current.generationId) return;
    if (current.status !== 'making') return;
    tx.set(
      ref,
      {
        voiceChange: {
          ...emptyVoice(current.used, current.creditEstimate),
          status: 'failed',
        },
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  });
}

async function writeVoice(
  songId: string,
  voice: NonNullable<SongDocument['voiceChange']>,
  extra?: Record<string, unknown>
): Promise<void> {
  await getAdminDb()
    .collection(COLLECTIONS.songs)
    .doc(songId)
    .set(
      {
        voiceChange: voice,
        ...extra,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
}

async function singAndStore(input: {
  song: SongDocument;
  reserved: NonNullable<SongDocument['voiceChange']>;
  prompt: string;
  lyrics: string;
  sourceAudioUrl: string;
  sourceVersionId: string;
  voice: SungGender;
  uid: string;
  platform: FunnelPlatform;
  webhookUrl: string;
}): Promise<void> {
  const submitted = await (deps().submit ?? submitSingOver)(
    {
      sourceAudioUrl: input.sourceAudioUrl,
      prompt: input.prompt,
      lyrics: input.lyrics,
      voice: input.voice,
      webhookUrl: input.webhookUrl,
      title: input.song.title,
    },
    {
      current: {
        attempts: input.song.singOver?.attempts ?? 0,
        creditEstimate: input.song.singOver?.creditEstimate ?? null,
      },
      cap: null,
    }
  );
  const db = getAdminDb();
  const generationRefDoc = db.collection(COLLECTIONS.generations).doc();
  const now = Timestamp.now();
  const generation: GenerationDocument = {
    id: generationRefDoc.id,
    ownerId: input.song.ownerId,
    songId: input.song.id,
    artistVersionId: input.song.artistVersionId,
    songVersionId: null,
    prompt: { structured: {}, freeText: input.prompt },
    parameters: {
      quality: 'medium',
      job: 'sing_over',
      purpose: VOICE_CHANGE_PURPOSE,
      sourceVersionId: input.sourceVersionId,
      voice: input.voice,
    },
    provider: 'musicgpt',
    status: 'pending',
    providerTaskId: submitted.result.taskId,
    providerConversionIds: submitted.result.conversionIds,
    providerProcessedConversions: [],
    output: { audioURL: null, stems: null, metadata: submitted.result.raw },
    error: null,
    createdAt: now as unknown as GenerationDocument['createdAt'],
    completedAt: null,
    contentHash: null,
  };
  const version = musicGptApiVersion();
  await generationRefDoc.set(generation);
  await (deps().saveBinding ?? saveMusicGptTaskBinding)({
    taskId: submitted.result.taskId,
    uid: input.uid,
    songId: input.song.id,
    conversionIds: submitted.result.conversionIds,
    model: version === 'v2' ? MUSICGPT_DEFAULT_MODEL : null,
    apiVersion: version,
    platform: input.platform,
    job: 'sing_over',
    ...(submitted.result.creditEstimate != null ? { creditEstimate: submitted.result.creditEstimate } : {}),
  });
  await writeVoice(
    input.song.id,
    {
      ...input.reserved,
      generationId: generation.id,
      creditEstimate: submitted.account.creditEstimate ?? input.reserved.creditEstimate,
    },
    {
      singOver: {
        attempts: submitted.account.attempts,
        creditEstimate: submitted.account.creditEstimate,
        lastGenerationId: generation.id,
      },
    }
  );
}

/**
 * Reserve the change when a beat is already on the song, then hand it to
 * Sing Over. A normal song with no cached instrumental is split first.
 * The cap is spent only when Sing Over accepts. A provider failure before
 * that gives the change back.
 */
export async function startVoiceChange(input: {
  songId: string;
  uid: string;
  voice: VoiceChangeVoice;
  platform: FunnelPlatform;
}): Promise<{ songId: string; used: number }> {
  const webhookUrl = requireCallback();
  const song = await ownedSong(input.songId, input.uid);
  const inputs = await loadVoiceInputs(song);
  const target = await singTarget(song, inputs);
  if (input.voice !== 'female' && input.voice !== 'male') throw new HttpError(400, 'Pick a voice first');
  const sung = currentSungGender({
    songVoice: song.createOptions?.voice ?? null,
    artistVoice: inputs.artistVoice,
  });
  if (sung && input.voice === sung) throw new HttpError(400, 'That is already the voice');
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.songs).doc(song.id);
  const reserved = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, 'Song not found');
    const current = snap.data() as SongDocument;
    if (current.ownerId !== input.uid || current.deletedAt) {
      throw new HttpError(403, 'Only the owner can change this song');
    }
    const state = voiceOf(current);
    if (state.status === 'making' || state.status === 'ready') {
      throw new HttpError(409, 'A voice change is already on the way');
    }
    if (voiceChangesLeft(state.used) <= 0) throw new HttpError(409, 'No voice changes left');
    const next = emptyVoice(target.singNow ? state.used + 1 : state.used, state.creditEstimate);
    next.status = 'making';
    next.voice = input.voice;
    next.startedAt = Timestamp.fromMillis(clockMs()) as NonNullable<SongDocument['voiceChange']>['startedAt'];
    next.originalVersionId = inputs.originalVersionId;
    next.sourceVersionId = target.sourceVersionId;
    tx.set(ref, { voiceChange: next, updatedAt: Timestamp.now() }, { merge: true });
    return next;
  });

  if (target.singNow) {
    try {
      await singAndStore({
        song,
        reserved,
        prompt: inputs.prompt,
        lyrics: inputs.lyrics,
        sourceAudioUrl: target.sourceAudioUrl,
        sourceVersionId: target.sourceVersionId,
        voice: input.voice,
        uid: input.uid,
        platform: input.platform,
        webhookUrl,
      });
    } catch (error) {
      await releaseReservation(song.id);
      const message = error instanceof Error ? error.message : '';
      if (message === 'Sing Over cap reached') throw new HttpError(409, 'No voice changes left');
      throw error;
    }
    return { songId: song.id, used: reserved.used };
  }

  let split: StemSplitResult;
  try {
    split = await (deps().split ?? submitStemExtraction)({
      sourceAudioUrl: target.sourceAudioUrl,
      webhookUrl,
    });
  } catch (error) {
    await clearMaking(song.id);
    throw error;
  }

  const generationRefDoc = db.collection(COLLECTIONS.generations).doc();
  const now = Timestamp.now();
  const generation: GenerationDocument = {
    id: generationRefDoc.id,
    ownerId: song.ownerId,
    songId: song.id,
    artistVersionId: song.artistVersionId,
    songVersionId: null,
    prompt: { structured: {}, freeText: inputs.prompt },
    parameters: {
      quality: 'medium',
      job: STEM_SPLIT_JOB,
      purpose: VOICE_SPLIT_PURPOSE,
      sourceVersionId: target.sourceVersionId,
      voice: input.voice,
      stemPreset: '2_stems',
    },
    provider: 'musicgpt',
    status: 'pending',
    providerTaskId: split.taskId,
    providerConversionIds: split.conversionId ? [split.conversionId] : [],
    providerProcessedConversions: [],
    output: { audioURL: null, stems: null, metadata: split.raw },
    error: null,
    createdAt: now as unknown as GenerationDocument['createdAt'],
    completedAt: null,
    contentHash: null,
  };
  try {
    await generationRefDoc.set(generation);
    await (deps().saveBinding ?? saveMusicGptTaskBinding)({
      taskId: split.taskId,
      uid: input.uid,
      songId: song.id,
      conversionIds: split.conversionId ? [split.conversionId] : [],
      model: null,
      apiVersion: 'v2',
      platform: input.platform,
      job: STEM_SPLIT_JOB,
      ...(split.creditEstimate != null ? { creditEstimate: split.creditEstimate } : {}),
    });
    await db.collection(COLLECTIONS.songs).doc(song.id).set(
      {
        voiceSplit: {
          sourceVersionId: target.sourceVersionId,
          audioUrl: null,
          status: 'splitting',
          taskId: split.taskId,
          generationId: generation.id,
          creditEstimate: split.creditEstimate,
        },
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  } catch (error) {
    await clearMaking(song.id);
    throw error;
  }

  return { songId: song.id, used: reserved.used };
}

function versionAudio(version: SongVersionDocument | undefined): string | null {
  const url = version?.audioURL?.trim() ?? '';
  return url || null;
}

/**
 * Keep a new voice as the song's main audio, or leave the original in place.
 * The version that was playing stays in songVersions either way.
 */
export async function keepVoiceChange(input: {
  songId: string;
  uid: string;
  versionId: string | null;
  platform: FunnelPlatform;
}): Promise<{ songId: string; kept: boolean }> {
  const song = await ownedSong(input.songId, input.uid);
  const state = voiceOf(song);
  if (!state.status || !state.generationId) throw new HttpError(409, 'Nothing to keep');
  const voice = state.voice;
  if (!voice) throw new HttpError(409, 'Nothing to keep');

  const [versions, generations] = await Promise.all([
    adminGetSongVersions(song.id),
    adminGetSongGenerations(song.id),
  ]);
  const generation = generations.find((item) => item.id === state.generationId);
  if (!generation || !isVoiceChangeGeneration(generation.parameters)) {
    throw new HttpError(409, 'Nothing to keep');
  }
  const conversionIds = generation.providerConversionIds ?? [];
  let kept = false;
  if (input.versionId && input.versionId !== state.originalVersionId) {
    const version = versions.find((item) => item.id === input.versionId);
    const output = version?.providerOutputId?.trim() ?? '';
    if (!version || !versionAudio(version) || !output || !conversionIds.includes(output)) {
      throw new HttpError(400, 'That take is not one of the new voices');
    }
    await adminSetPrimarySongVersion(song.id, version.id);
    kept = true;
  }

  const elapsed = msBetween(millisOf(state.startedAt), clockMs());
  const keptVoice = voice === 'female' || voice === 'male' ? voice : null;
  await writeVoice(
    song.id,
    {
      ...emptyVoice(state.used, state.creditEstimate),
    },
    kept && keptVoice
      ? {
          createOptions: {
            instrumental: false,
            voice: keptVoice,
            feel: [...(song.createOptions?.feel ?? [])],
            energy:
              song.createOptions?.energy === 'Slow' ||
              song.createOptions?.energy === 'Steady' ||
              song.createOptions?.energy === 'Fast'
                ? song.createOptions.energy
                : 'Steady',
            words: song.createOptions?.words === 'mine' ? 'mine' : 'artist',
          },
        }
      : undefined
  );

  try {
    await trackFunnelEvent(
      input.uid,
      'voice_change',
      {
        songId: song.id,
        artistId: song.artistId,
        voice,
        kept,
        source: voiceChangeSource(song.path),
        split: voiceChangeSplitsBeat(song.path),
        ...(elapsed != null ? { msToKeep: elapsed } : {}),
      },
      input.platform
    );
  } catch (error) {
    console.error('[funnel] voice_change', error instanceof Error ? error.message : 'failed');
  }
  return { songId: song.id, kept };
}

/**
 * The split webhook stored an instrumental. Cache it, then Sing Over that
 * beat. A second delivery does not split or sing again. No voice yet means
 * the cap is not spent.
 */
export async function noteVoiceSplitReady(input: {
  songId: string;
  splitGenerationId: string;
  instrumentalUrl: string;
  creditEstimate: number | null;
}): Promise<void> {
  const db = getAdminDb();
  const generationRef = db.collection(COLLECTIONS.generations).doc(input.splitGenerationId);
  const songRef = db.collection(COLLECTIONS.songs).doc(input.songId);
  const gate = await db.runTransaction(async (tx) => {
    const genSnap = await tx.get(generationRef);
    const songSnap = await tx.get(songRef);
    if (!genSnap.exists || !songSnap.exists) return { action: 'skip' as const };
    const gen = genSnap.data() as GenerationDocument;
    if (gen.status === 'completed' || gen.status === 'processing' || gen.status === 'failed') {
      return { action: 'skip' as const };
    }
    const song = { ...(songSnap.data() as SongDocument), id: songSnap.id || input.songId };
    const state = voiceOf(song);
    const credit =
      input.creditEstimate ??
      (typeof song.voiceSplit?.creditEstimate === 'number' ? song.voiceSplit.creditEstimate : null);
    const cache: NonNullable<SongDocument['voiceSplit']> = {
      sourceVersionId: state.sourceVersionId || state.originalVersionId || song.currentVersionId,
      audioUrl: input.instrumentalUrl,
      status: 'ready',
      taskId: typeof gen.providerTaskId === 'string' ? gen.providerTaskId : song.voiceSplit?.taskId ?? null,
      generationId: input.splitGenerationId,
      creditEstimate: credit,
    };
    if (state.generationId || state.status !== 'making') {
      tx.set(songRef, { voiceSplit: cache, updatedAt: Timestamp.now() }, { merge: true });
      tx.set(generationRef, { status: 'completed', completedAt: Timestamp.now() }, { merge: true });
      return { action: 'cached' as const };
    }
    if (voiceChangesLeft(state.used) <= 0) {
      tx.set(
        songRef,
        {
          voiceSplit: cache,
          voiceChange: {
            ...emptyVoice(state.used, state.creditEstimate),
            status: 'failed' as const,
          },
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
      tx.set(generationRef, { status: 'completed', completedAt: Timestamp.now() }, { merge: true });
      return { action: 'cap' as const };
    }
    tx.set(generationRef, { status: 'processing' }, { merge: true });
    tx.set(songRef, { voiceSplit: cache, updatedAt: Timestamp.now() }, { merge: true });
    return { action: 'sing' as const, song, state, cache };
  });

  if (gate.action !== 'sing') return;

  let platform: FunnelPlatform = 'unknown';
  const taskId = gate.cache.taskId;
  if (taskId) {
    const binding = await getMusicGptTaskBinding(taskId);
    if (binding?.platform === 'web' || binding?.platform === 'ios' || binding?.platform === 'unknown') {
      platform = binding.platform;
    }
  }

  try {
    const fresh = await adminGetSong(input.songId);
    const song = fresh ? { ...fresh, id: fresh.id || input.songId } : gate.song;
    const inputs = await loadVoiceInputs(song);
    const voice = gate.state.voice;
    if (voice !== 'female' && voice !== 'male') {
      throw new HttpError(400, 'Pick a voice first');
    }
    const webhookUrl = requireCallback();
    await singAndStore({
      song,
      reserved: {
        ...gate.state,
        used: gate.state.used + 1,
        status: 'making',
        voice,
        originalVersionId: gate.state.originalVersionId,
        sourceVersionId: gate.cache.sourceVersionId,
        startedAt: song.voiceChange?.startedAt ?? gate.state.startedAt,
      },
      prompt: inputs.prompt,
      lyrics: inputs.lyrics,
      sourceAudioUrl: input.instrumentalUrl,
      sourceVersionId: gate.cache.sourceVersionId,
      voice,
      uid: song.ownerId,
      platform,
      webhookUrl,
    });
    await generationRef.set({ status: 'completed', completedAt: Timestamp.now() }, { merge: true });
  } catch (error) {
    await failVoiceChangeWithoutVoice(input.songId);
    const message = error instanceof Error ? error.message : 'Stem split could not sing';
    await generationRef.set(
      { status: 'failed', error: message.slice(0, 300), completedAt: Timestamp.now() },
      { merge: true }
    );
  }
}

/** Split failed before a voice existed. Same error as a failed change, cap unchanged. */
export async function noteVoiceSplitFailed(songId: string, generationId: string): Promise<void> {
  await failVoiceChangeWithoutVoice(songId);
  if (!generationId) return;
  const ref = getAdminDb().collection(COLLECTIONS.generations).doc(generationId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const status = (snap.data() as GenerationDocument | undefined)?.status;
  if (status === 'completed' || status === 'failed') return;
  await ref.set(
    { status: 'failed', error: 'Stem split failed', completedAt: Timestamp.now() },
    { merge: true }
  );
}

/** Webhook: a voice-change take landed, or the job failed. Does not move the current audio. */
export async function noteVoiceChangeSettled(
  songId: string,
  generationId: string,
  status: 'making' | 'ready' | 'failed'
): Promise<void> {
  const song = await adminGetSong(songId);
  if (!song?.voiceChange) return;
  const state = voiceOf(song);
  if (state.generationId && state.generationId !== generationId) return;
  if (!state.status) return;
  if (state.status === 'ready' && status === 'making') return;
  if (state.status === 'failed' && status !== 'failed') return;
  await writeVoice(song.id, {
    ...state,
    status,
    generationId: state.generationId ?? generationId,
  });
}

export function voiceChangeCap(): number {
  return VOICE_CHANGE_CAP;
}
