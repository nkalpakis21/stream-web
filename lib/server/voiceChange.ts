/**
 * Owner-only voice change. Admin SDK writes only.
 *
 * Reuses the shared Sing Over module: the stored beat is uploaded as
 * `audio_file`, lyrics come from generation metadata, and MusicGPT returns
 * two takes. The original version stays on the song until the owner keeps
 * a new one. This does not create a song and does not emit `first_song_started`.
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
import { saveMusicGptTaskBinding } from '@/lib/server/musicgptTaskBinding';
import { assertNoObjectionableContent } from '@/lib/server/objectionable';
import {
  adminGetSong,
  adminGetSongGenerations,
  adminGetSongVersions,
  adminSetPrimarySongVersion,
} from '@/lib/server/songsAdmin';
import { submitSingOver, type SingOverSubmitResult } from '@/lib/server/singOver';
import { BEAT_FIRST_PATH, singOverPromptText } from '@/lib/songs/beatFirst';
import {
  VOICE_CHANGE_CAP,
  VOICE_CHANGE_PURPOSE,
  isVoiceChangeGeneration,
  readVoiceChangeStatus,
  readVoiceChangeVoice,
  resolveStoredInstrumental,
  currentSungGender,
  msBetween,
  savedLyricsText,
  songIsInstrumental,
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

type Prepared = {
  song: SongDocument;
  lyrics: string;
  prompt: string;
  source: { versionId: string; audioUrl: string };
  originalVersionId: string;
  artistVoice: string | null;
};

async function prepare(song: SongDocument): Promise<Prepared> {
  if (song.path !== BEAT_FIRST_PATH) throw new HttpError(400, 'No separable beat for this song');
  if (songIsInstrumental(song)) throw new HttpError(400, 'This song is instrumental');
  if (song.audioReady !== true) throw new HttpError(409, 'The song is not ready');
  const [versions, generations, artist] = await Promise.all([
    adminGetSongVersions(song.id),
    adminGetSongGenerations(song.id),
    adminGetArtist(song.artistId),
  ]);
  const generationRefs = generations.map(generationRef);
  const current = versions.find((version) => version.id === song.currentVersionId);
  const lyrics = savedLyricsText(generationRefs, current?.providerOutputId ?? null);
  if (!lyrics) throw new HttpError(400, 'This song has no saved lyrics');
  const source = resolveStoredInstrumental({
    song,
    versions,
    generations: generationRefs,
  });
  if (!source) throw new HttpError(400, 'No separable beat for this song');
  const original = versions.find((version) => version.id === song.currentVersionId && version.audioURL?.trim());
  if (!original) throw new HttpError(400, 'This song has no audio to keep');
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
  return { song, lyrics, prompt, source, originalVersionId: original.id, artistVoice };
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

/**
 * Reserve one of the two voice changes, then hand the beat to Sing Over.
 * A provider failure before accept gives the change back.
 */
export async function startVoiceChange(input: {
  songId: string;
  uid: string;
  voice: VoiceChangeVoice;
  platform: FunnelPlatform;
}): Promise<{ songId: string; used: number }> {
  const webhookUrl = requireCallback();
  const song = await ownedSong(input.songId, input.uid);
  const prepared = await prepare(song);
  if (input.voice !== 'female' && input.voice !== 'male') throw new HttpError(400, 'Pick a voice first');
  const sung = currentSungGender({
    songVoice: song.createOptions?.voice ?? null,
    artistVoice: prepared.artistVoice,
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
    const next = emptyVoice(state.used + 1, state.creditEstimate);
    next.status = 'making';
    next.voice = input.voice;
    next.startedAt = Timestamp.fromMillis(clockMs()) as NonNullable<SongDocument['voiceChange']>['startedAt'];
    next.originalVersionId = prepared.originalVersionId;
    next.sourceVersionId = prepared.source.versionId;
    tx.set(ref, { voiceChange: next, updatedAt: Timestamp.now() }, { merge: true });
    return next;
  });

  let submitted: { result: SingOverSubmitResult; account: { attempts: number; creditEstimate: number | null } };
  try {
    submitted = await (deps().submit ?? submitSingOver)(
      {
        sourceAudioUrl: prepared.source.audioUrl,
        prompt: prepared.prompt,
        lyrics: prepared.lyrics,
        voice: input.voice,
        webhookUrl,
        title: song.title,
      },
      {
        current: {
          attempts: song.singOver?.attempts ?? 0,
          creditEstimate: song.singOver?.creditEstimate ?? null,
        },
        cap: null,
      }
    );
  } catch (error) {
    await releaseReservation(song.id);
    const message = error instanceof Error ? error.message : '';
    if (message === 'Sing Over cap reached') throw new HttpError(409, 'No voice changes left');
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
    prompt: { structured: {}, freeText: prepared.prompt },
    parameters: {
      quality: 'medium',
      job: 'sing_over',
      purpose: VOICE_CHANGE_PURPOSE,
      sourceVersionId: prepared.source.versionId,
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
  try {
    await generationRefDoc.set(generation);
    await (deps().saveBinding ?? saveMusicGptTaskBinding)({
      taskId: submitted.result.taskId,
      uid: input.uid,
      songId: song.id,
      conversionIds: submitted.result.conversionIds,
      model: version === 'v2' ? MUSICGPT_DEFAULT_MODEL : null,
      apiVersion: version,
      platform: input.platform,
      job: 'sing_over',
      ...(submitted.result.creditEstimate != null ? { creditEstimate: submitted.result.creditEstimate } : {}),
    });
    await writeVoice(
      song.id,
      {
        ...reserved,
        generationId: generation.id,
        creditEstimate: submitted.account.creditEstimate ?? reserved.creditEstimate,
      },
      {
        singOver: {
          attempts: submitted.account.attempts,
          creditEstimate: submitted.account.creditEstimate,
          lastGenerationId: generation.id,
        },
      }
    );
  } catch (error) {
    await releaseReservation(song.id);
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
        ...(elapsed != null ? { msToKeep: elapsed } : {}),
      },
      input.platform
    );
  } catch (error) {
    console.error('[funnel] voice_change', error instanceof Error ? error.message : 'failed');
  }
  return { songId: song.id, kept };
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
