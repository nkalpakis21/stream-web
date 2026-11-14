/**
 * Beat-first orchestration. Admin SDK writes only.
 * The instrumental uses the same MusicAI v6 path as "Just the beat".
 * Vocals go through the shared Sing Over module.
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  MUSICGPT_DEFAULT_MODEL,
  buildMusicGPTStyleFromArtistContext,
  createMusicGPTSong,
  createMusicGptLyrics,
  musicGptApiVersion,
} from '@/lib/ai/providers/musicgpt';
import { HttpError } from '@/lib/api/requireAuth';
import {
  ENERGY_OPTIONS,
  cleanLyrics,
  isLyricsSessionId,
  parseCreateOptions,
  parseFeelList,
  type Energy,
  type FeelLabel,
  type VoiceChoice,
} from '@/lib/create/songOptions';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAdminDb } from '@/lib/firebase/admin';
import type { FunnelPlatform } from '@/lib/funnel/platform';
import { enqueueSongCoverGeneration } from '@/lib/covers/enqueue';
import { isFalCoverPipeline } from '@/lib/covers/config';
import {
  addCredit,
  BEAT_FIRST_PATH,
  beatDirection,
  beatRetryInFlight,
  lyricsNeeded,
  msFromFirstBeat,
  nextBeatRetry,
  singOverPromptText,
  type BeatFirstState,
  type BeatStage,
} from '@/lib/songs/beatFirst';
import { commitIdempotentSongCreate, isSongCreateIdempotencyKey, SongCreateIdTaken } from '@/lib/songs/songCreate';
import { timestampMillis, trackFunnelEvent } from '@/lib/server/funnel';
import { isVoiceSlug, voicedRequest } from '@/lib/voices/streamstarVoices';
import { buildLyricsDraftPrompt, reserveLyricsDraft } from '@/lib/server/lyricsDraft';
import { readMusicGptCreditEstimate } from '@/lib/server/musicgptUsage';
import { saveMusicGptTaskBinding } from '@/lib/server/musicgptTaskBinding';
import { adminGetArtist } from '@/lib/server/artistsAdmin';
import { assertNoObjectionableContent } from '@/lib/server/objectionable';
import {
  adminAbandonOrphanSong,
  adminGetSong,
  adminGetSongGenerations,
  adminGetSongVersions,
  adminNoteSongGenerationAccepted,
  adminSetPrimarySongVersion,
} from '@/lib/server/songsAdmin';
import { notifyOwnerSongReady } from '@/lib/server/expoPush';
import { adminCreateSongReadyNotification } from '@/lib/server/notificationsAdmin';
import { submitSingOver, type SingOverVoice } from '@/lib/server/singOver';
import { maybePostSongLive } from '@/lib/x/postSong';
import { musicGptGenerationCallback } from '@/lib/webhooks/baseUrl';
import type {
  AIArtistDocument,
  AIArtistVersionDocument,
  GenerationDocument,
  SongDocument,
  SongVersionDocument,
} from '@/types/firestore';

export type { BeatStage };

type BeatDeps = {
  createMusic?: typeof createMusicGPTSong;
  saveBinding?: typeof saveMusicGptTaskBinding;
  submitVocals?: typeof submitSingOver;
  draftLyrics?: (prompt: string) => Promise<string>;
  reserveDraft?: typeof reserveLyricsDraft;
  now?: () => number;
};

let depsForTests: BeatDeps | null = null;

export function setBeatFirstDepsForTests(deps: BeatDeps | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setBeatFirstDepsForTests is disabled in production');
  }
  depsForTests = deps;
}

function deps(): BeatDeps {
  if (process.env.NODE_ENV === 'production') return {};
  return depsForTests ?? {};
}

function nowMs(): number {
  const clock = deps().now;
  return clock ? clock() : Date.now();
}

function emptyBeat(stage: BeatStage, retriesUsed = 0): NonNullable<SongDocument['beatFirst']> {
  return {
    stage,
    retriesUsed,
    chosenVersionId: null,
    firstBeatAt: null,
    vocalsAdded: false,
    creditEstimate: null,
  };
}

function beatOf(song: SongDocument): NonNullable<SongDocument['beatFirst']> {
  return song.beatFirst ?? emptyBeat('generating');
}

async function loadOwnedArtist(artistId: string, uid: string): Promise<AIArtistDocument> {
  const artist = await adminGetArtist(artistId);
  if (!artist || artist.deletedAt) throw new HttpError(404, 'Artist not found');
  if (artist.ownerId !== uid) throw new HttpError(403, 'Only the owner can generate for this artist');
  return artist;
}

async function loadArtistVersion(versionId: string): Promise<AIArtistVersionDocument | null> {
  const snap = await getAdminDb().collection(COLLECTIONS.artistVersions).doc(versionId).get();
  if (!snap.exists) return null;
  return snap.data() as AIArtistVersionDocument;
}

function styleFromArtist(
  artist: AIArtistDocument,
  version: AIArtistVersionDocument | null,
  feel: readonly string[],
  energy: string | null
): string {
  const musicStyle = buildMusicGPTStyleFromArtistContext({
    styleDNA: version?.styleDNA ?? artist.styleDNA,
    lore: version?.lore ?? artist.lore,
    vocalIdentity: version?.vocalIdentity ?? artist.vocalIdentity ?? null,
  }).music_style;
  return beatDirection({ musicStyle, feel, energy });
}

function requireCallback(): string {
  const callback = musicGptGenerationCallback();
  if (!callback.ok) throw new HttpError(callback.status, callback.error);
  return callback.webhookUrl;
}

async function writeGeneration(input: {
  song: SongDocument;
  taskId: string;
  conversionIds: string[];
  prompt: string;
  job: 'beat' | 'sing_over';
  sourceVersionId?: string | null;
  raw: Record<string, unknown>;
}): Promise<string> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.generations).doc();
  const now = Timestamp.now();
  const generation: GenerationDocument = {
    id: ref.id,
    ownerId: input.song.ownerId,
    songId: input.song.id,
    artistVersionId: input.song.artistVersionId,
    songVersionId: null,
    prompt: { structured: {}, freeText: input.prompt },
    parameters: {
      quality: 'medium',
      job: input.job,
      ...(input.sourceVersionId ? { sourceVersionId: input.sourceVersionId } : {}),
    },
    provider: 'musicgpt',
    status: 'pending',
    providerTaskId: input.taskId,
    providerConversionIds: input.conversionIds,
    providerProcessedConversions: [],
    output: { audioURL: null, stems: null, metadata: input.raw },
    error: null,
    createdAt: now as unknown as GenerationDocument['createdAt'],
    completedAt: null,
    contentHash: null,
  };
  await ref.set(generation);
  return ref.id;
}

async function bindTask(input: {
  taskId: string;
  uid: string;
  songId: string;
  conversionIds: string[];
  creditEstimate: number | null;
  platform: FunnelPlatform;
  job: 'beat' | 'sing_over';
  raw: Record<string, unknown>;
}): Promise<void> {
  const version = musicGptApiVersion();
  await (deps().saveBinding ?? saveMusicGptTaskBinding)({
    taskId: input.taskId,
    uid: input.uid,
    songId: input.songId,
    conversionIds: input.conversionIds,
    model: version === 'v2' ? MUSICGPT_DEFAULT_MODEL : null,
    apiVersion: version,
    platform: input.platform,
    job: input.job,
    ...(input.creditEstimate != null ? { creditEstimate: input.creditEstimate } : {}),
  });
}

function taskFromResponse(response: Record<string, unknown>): {
  taskId: string;
  conversionIds: string[];
  creditEstimate: number | null;
} {
  const taskId =
    (typeof response.task_id === 'string' && response.task_id) ||
    (typeof response.taskId === 'string' && response.taskId) ||
    (typeof response.id === 'string' && response.id) ||
    '';
  if (!taskId) throw new Error('MusicGPT did not return a task id');
  const conversionIds: string[] = [];
  if (typeof response.conversion_id_1 === 'string' && response.conversion_id_1) {
    conversionIds.push(response.conversion_id_1);
  }
  if (typeof response.conversion_id_2 === 'string' && response.conversion_id_2) {
    conversionIds.push(response.conversion_id_2);
  }
  return { taskId, conversionIds, creditEstimate: readMusicGptCreditEstimate(response) };
}

async function startInstrumental(input: {
  song: SongDocument;
  prompt: string;
  musicStyle: string;
  platform: FunnelPlatform;
  webhookUrl: string;
}): Promise<void> {
  const createMusic = deps().createMusic ?? createMusicGPTSong;
  const response = (await createMusic({
    prompt: input.prompt,
    music_style: input.musicStyle || undefined,
    make_instrumental: true,
    webhook_url: input.webhookUrl,
  })) as Record<string, unknown>;
  const task = taskFromResponse(response);
  await bindTask({
    taskId: task.taskId,
    uid: input.song.ownerId,
    songId: input.song.id,
    conversionIds: task.conversionIds,
    creditEstimate: task.creditEstimate,
    platform: input.platform,
    job: 'beat',
    raw: response,
  });
  await writeGeneration({
    song: input.song,
    taskId: task.taskId,
    conversionIds: task.conversionIds,
    prompt: input.prompt,
    job: 'beat',
    raw: response,
  });
  const beat = beatOf(input.song);
  await getAdminDb().collection(COLLECTIONS.songs).doc(input.song.id).set(
    {
      beatFirst: {
        ...beat,
        stage: 'generating',
        creditEstimate: addCredit(beat.creditEstimate, task.creditEstimate),
      },
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  try {
    await adminNoteSongGenerationAccepted(input.song.id);
  } catch (error) {
    console.error('[beat-first] attempt clock', error instanceof Error ? error.message : 'failed');
  }
}

export function parseBeatRequest(raw: unknown): {
  artistId: string;
  title: string;
  prompt: string;
  feel: FeelLabel[];
  energy: Energy;
  idempotencyKey: string | null;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'Invalid request');
  const body = raw as Record<string, unknown>;
  const artistId = typeof body.artistId === 'string' ? body.artistId.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 300) : '';
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 300) : '';
  if (!artistId || !title || !prompt) throw new HttpError(400, 'Artist, title, and prompt are required');
  const parsed = parseCreateOptions({
    instrumental: true,
    feel: body.feel,
    energy: body.energy,
    voice: 'same',
  });
  const feel = parsed?.feel ?? parseFeelList(body.feel);
  const energy = readEnergy(body.energy);
  const idempotencyKey = isSongCreateIdempotencyKey(body.idempotencyKey) ? body.idempotencyKey : null;
  return { artistId, title, prompt, feel, energy, idempotencyKey };
}

export async function startBeatFirst(input: {
  uid: string;
  artistId: string;
  title: string;
  prompt: string;
  feel: FeelLabel[];
  energy: Energy;
  idempotencyKey: string | null;
  platform: FunnelPlatform;
}): Promise<{ songId: string; reused: boolean }> {
  assertNoObjectionableContent(input.title, input.prompt);
  const webhookUrl = requireCallback();
  const artist = await loadOwnedArtist(input.artistId, input.uid);
  const version = await loadArtistVersion(artist.currentVersionId);
  const musicStyle = styleFromArtist(artist, version, input.feel, input.energy);
  const db = getAdminDb();
  const now = Timestamp.now();
  const createdAtMs = nowMs();

  const created = await commitIdempotentSongCreate<SongDocument>(
    {
      async get(id) {
        const snap = await db.collection(COLLECTIONS.songs).doc(id).get();
        if (!snap.exists) return null;
        const data = snap.data() as SongDocument;
        return { ...data, id: data.id || snap.id };
      },
      async insert(song) {
        const ref = db.collection(COLLECTIONS.songs).doc(song.id);
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (snap.exists) throw new SongCreateIdTaken();
          tx.set(ref, song);
        });
      },
      newId() {
        return db.collection(COLLECTIONS.songs).doc().id;
      },
    },
    {
      ownerId: input.uid,
      idempotencyKey: input.idempotencyKey,
      nowMs: createdAtMs,
      identity: (song) => ({
        ownerId: song.ownerId,
        deletedAt: song.deletedAt,
        createdAtMs: timestampMillis(song.createdAt) ?? 0,
      }),
      build(songId) {
        const versionId = db.collection(COLLECTIONS.songVersions).doc().id;
        const song: SongDocument = {
          id: songId,
          ownerId: input.uid,
          artistId: artist.id,
          artistVersionId: artist.currentVersionId,
          title: input.title,
          isPublic: false,
          audioReady: false,
          publicOnReady: true,
          ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
          createPrompt: input.prompt,
          path: BEAT_FIRST_PATH,
          beatFirst: emptyBeat('generating'),
          createOptions: {
            instrumental: false,
            voice: 'same',
            feel: [...input.feel],
            energy: input.energy,
            words: 'artist',
          },
          createdAt: now as unknown as SongDocument['createdAt'],
          updatedAt: now as unknown as SongDocument['updatedAt'],
          deletedAt: null,
          currentVersionId: versionId,
          parentSongId: null,
          collaborationType: null,
          albumCoverPath: null,
          albumCoverThumbnail: null,
          coverPosterUrl: null,
          coverVideoUrl: null,
          coverMotionStatus: null,
          coverMotionError: null,
          coverUpdatedAt: null,
          coverProvider: null,
          playCount: 0,
        };
        return song;
      },
    }
  );

  if (created.reused) return { songId: created.song.id, reused: true };

  const placeholder: SongVersionDocument = {
    id: created.song.currentVersionId,
    songId: created.song.id,
    versionNumber: 1,
    title: created.song.title,
    createdBy: input.uid,
    createdAt: now as unknown as SongVersionDocument['createdAt'],
    parentVersionId: null,
    audioURL: null,
    providerOutputId: null,
    isPrimary: true,
  };
  await db.collection(COLLECTIONS.songVersions).doc(placeholder.id).set(placeholder);

  try {
    await startInstrumental({
      song: created.song,
      prompt: input.prompt,
      musicStyle,
      platform: input.platform,
      webhookUrl,
    });
  } catch (error) {
    await adminAbandonOrphanSong(created.song.id, { prompt: input.prompt });
    throw error;
  }

  try {
    await trackFunnelEvent(
      input.uid,
      'beat_first_started',
      { songId: created.song.id, artistId: artist.id },
      input.platform
    );
    await trackFunnelEvent(
      input.uid,
      'artist_picked',
      { songId: created.song.id, artistId: artist.id },
      input.platform
    );
  } catch (error) {
    console.error('[funnel] beat_first_started', error instanceof Error ? error.message : 'failed');
  }
  return { songId: created.song.id, reused: false };
}

async function ownedBeat(songId: string, uid: string): Promise<SongDocument> {
  const song = await adminGetSong(songId);
  if (!song || song.deletedAt) throw new HttpError(404, 'Song not found');
  if (song.ownerId !== uid) throw new HttpError(403, 'Only the owner can change this song');
  if (song.path !== BEAT_FIRST_PATH) throw new HttpError(400, 'This song was not started from a beat');
  return song;
}

export async function retryBeat(input: {
  songId: string;
  uid: string;
  feel: FeelLabel[];
  energy: Energy;
  platform: FunnelPlatform;
}): Promise<{ retriesUsed: number; retriesLeft: number }> {
  const webhookUrl = requireCallback();
  const song = await ownedBeat(input.songId, input.uid);
  if (beatRetryInFlight(song.beatFirst?.stage)) {
    throw new HttpError(409, 'A beat is already on the way');
  }
  if (song.beatFirst?.stage === 'vocals' || song.beatFirst?.stage === 'instrumental' || song.audioReady === true) {
    throw new HttpError(409, 'This song already has a finished take');
  }
  const next = nextBeatRetry(song.beatFirst?.retriesUsed ?? 0);
  if (next == null) throw new HttpError(409, 'No beat retries left');

  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.songs).doc(song.id);
  const reserved = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, 'Song not found');
    const current = snap.data() as SongDocument;
    if (current.ownerId !== input.uid || current.path !== BEAT_FIRST_PATH) {
      throw new HttpError(403, 'Only the owner can change this song');
    }
    if (beatRetryInFlight(current.beatFirst?.stage)) {
      throw new HttpError(409, 'A beat is already on the way');
    }
    const reservedUsed = nextBeatRetry(current.beatFirst?.retriesUsed ?? 0);
    if (reservedUsed == null) throw new HttpError(409, 'No beat retries left');
    const beat = beatOf(current);
    tx.set(
      ref,
      {
        beatFirst: { ...beat, retriesUsed: reservedUsed, stage: 'generating' },
        createOptions: {
          instrumental: false,
          voice: current.createOptions?.voice ?? 'same',
          feel: [...input.feel],
          energy: input.energy,
          words: current.createOptions?.words ?? 'artist',
        },
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
    return reservedUsed;
  });

  const artist = await loadOwnedArtist(song.artistId, input.uid);
  const version = await loadArtistVersion(song.artistVersionId);
  const prompt = (song.createPrompt || input.energy).slice(0, 300);
  try {
    await startInstrumental({
      song: { ...song, beatFirst: { ...beatOf(song), retriesUsed: reserved, stage: 'generating' } },
      prompt,
      musicStyle: styleFromArtist(artist, version, input.feel, input.energy),
      platform: input.platform,
      webhookUrl,
    });
  } catch (error) {
    await ref.set(
      {
        beatFirst: { ...beatOf(song), retriesUsed: song.beatFirst?.retriesUsed ?? 0, stage: 'ready' },
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
    throw error;
  }

  try {
    await trackFunnelEvent(
      input.uid,
      'beat_regenerated',
      { songId: song.id, artistId: song.artistId, retriesUsed: reserved },
      input.platform
    );
  } catch (error) {
    console.error('[funnel] beat_regenerated', error instanceof Error ? error.message : 'failed');
  }
  return { retriesUsed: reserved, retriesLeft: Math.max(0, 2 - reserved) };
}

function versionAudio(version: SongVersionDocument | undefined): string | null {
  const url = version?.audioURL?.trim() ?? '';
  return url || null;
}

async function chosenBeatVersion(song: SongDocument, versionId: string): Promise<SongVersionDocument> {
  const versions = await adminGetSongVersions(song.id);
  const version = versions.find((item) => item.id === versionId);
  if (!version || !versionAudio(version)) throw new HttpError(400, 'Pick a beat first');
  const generations = await adminGetSongGenerations(song.id);
  const beatGenerations = generations.filter((generation) => generation.parameters?.job === 'beat');
  const latest = beatGenerations[0];
  const ids = latest?.providerConversionIds ?? [];
  if (ids.length > 0 && version.providerOutputId && !ids.includes(version.providerOutputId)) {
    throw new HttpError(400, 'That beat is from an earlier pass');
  }
  return version;
}

async function draftIfNeeded(input: {
  uid: string;
  song: SongDocument;
  artist: AIArtistDocument;
  words: 'artist' | 'mine';
  lyrics: string;
  sessionId: string;
}): Promise<string> {
  if (!lyricsNeeded(input.words, input.lyrics)) {
    const text = cleanLyrics(input.lyrics);
    if (!text) throw new HttpError(400, 'Add words first');
    assertNoObjectionableContent(text);
    return text;
  }
  if (!isLyricsSessionId(input.sessionId)) throw new HttpError(400, 'sessionId is required');
  const prompt = buildLyricsDraftPrompt(input.song.createPrompt, {
    name: input.artist.name,
    genres: input.artist.styleDNA?.genres ?? [],
    moods: input.artist.styleDNA?.moods ?? [],
    vocalIdentity: input.artist.vocalIdentity,
    lore: input.artist.lore,
  });
  if (!prompt) throw new HttpError(400, 'Add a prompt first.');
  assertNoObjectionableContent(prompt);
  const createdAtMs = nowMs();
  const decision = await (deps().reserveDraft ?? reserveLyricsDraft)(input.uid, input.sessionId, createdAtMs);
  if (!decision.ok) {
    throw new HttpError(429, decision.reason === 'day' ? 'Daily draft limit reached.' : 'This song already has 3 drafts.');
  }
  const lyrics = await (deps().draftLyrics ?? createMusicGptLyrics)(prompt);
  const text = lyrics.trim().slice(0, 2000);
  if (!text) throw new HttpError(502, "Couldn't write a draft.");
  assertNoObjectionableContent(text);
  return text;
}

export function parseVocalsRequest(raw: unknown): {
  versionId: string;
  voice: VoiceChoice;
  words: 'artist' | 'mine';
  lyrics: string;
  sessionId: string;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'Invalid request');
  const body = raw as Record<string, unknown>;
  const versionId = typeof body.versionId === 'string' ? body.versionId.trim() : '';
  if (!versionId || versionId.length > 128 || versionId.includes('/')) {
    throw new HttpError(400, 'versionId is invalid');
  }
  const voice: VoiceChoice = body.voice === 'female' || body.voice === 'male' ? body.voice : 'same';
  const words = body.words === 'mine' ? 'mine' : 'artist';
  const lyrics = typeof body.lyrics === 'string' ? body.lyrics : '';
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  return { versionId, voice, words, lyrics, sessionId };
}

export async function addBeatVocals(input: {
  songId: string;
  uid: string;
  versionId: string;
  voice: VoiceChoice;
  words: 'artist' | 'mine';
  lyrics: string;
  sessionId: string;
  platform: FunnelPlatform;
}): Promise<{ songId: string }> {
  const webhookUrl = requireCallback();
  const song = await ownedBeat(input.songId, input.uid);
  if (song.beatFirst?.stage !== 'ready') throw new HttpError(409, 'The beat is not ready');
  const version = await chosenBeatVersion(song, input.versionId);
  const audioUrl = versionAudio(version);
  if (!audioUrl) throw new HttpError(400, 'Pick a beat first');
  const artist = await loadOwnedArtist(song.artistId, input.uid);
  const artistVersion = await loadArtistVersion(song.artistVersionId);
  const lyrics = await draftIfNeeded({
    uid: input.uid,
    song,
    artist,
    words: input.words,
    lyrics: input.lyrics,
    sessionId: input.sessionId,
  });
  const feel = song.createOptions?.feel ?? [];
  const energy = song.createOptions?.energy ?? null;
  let singPrompt = singOverPromptText({
    musicStyle: buildMusicGPTStyleFromArtistContext({
      styleDNA: artistVersion?.styleDNA ?? artist.styleDNA,
      lore: artistVersion?.lore ?? artist.lore,
      vocalIdentity: artistVersion?.vocalIdentity ?? artist.vocalIdentity ?? null,
    }).music_style,
    feel,
    energy,
    idea: song.createPrompt,
  });
  let voice: SingOverVoice = 'same';
  const artistSlug = isVoiceSlug(artist.voiceSlug) ? artist.voiceSlug : null;
  if (artistSlug) {
    try {
      const voiced = voicedRequest({ prompt: singPrompt, slug: artistSlug });
      singPrompt = voiced.prompt;
      voice = voiced.gender;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'Voice is not ready' || message === 'Locked prompt is missing') {
        throw new HttpError(409, "Couldn't use that voice.");
      }
      throw error;
    }
  }

  const db = getAdminDb();
  if (!singPrompt) throw new HttpError(400, 'Add a prompt first.');
  const gate = accountForSong(song);
  let submitted;
  try {
    submitted = await (deps().submitVocals ?? submitSingOver)(
      {
        sourceAudioUrl: audioUrl,
        prompt: singPrompt,
        lyrics,
        voice,
        webhookUrl,
        title: song.title,
      },
      { current: gate, cap: null }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Sing Over cap reached') throw new HttpError(409, 'No vocal passes left');
    throw error;
  }

  await bindTask({
    taskId: submitted.result.taskId,
    uid: input.uid,
    songId: song.id,
    conversionIds: submitted.result.conversionIds,
    creditEstimate: submitted.result.creditEstimate,
    platform: input.platform,
    job: 'sing_over',
    raw: submitted.result.raw,
  });
  const generationId = await writeGeneration({
    song,
    taskId: submitted.result.taskId,
    conversionIds: submitted.result.conversionIds,
    prompt: singPrompt,
    job: 'sing_over',
    sourceVersionId: version.id,
    raw: submitted.result.raw,
  });
  const beat = beatOf(song);
  await db.collection(COLLECTIONS.songs).doc(song.id).set(
    {
      beatFirst: {
        ...beat,
        stage: 'singing',
        chosenVersionId: version.id,
        vocalsAdded: false,
      },
      singOver: {
        attempts: submitted.account.attempts,
        creditEstimate: submitted.account.creditEstimate,
        lastGenerationId: generationId,
      },
      createLyrics: lyrics,
      createOptions: {
        instrumental: false,
        voice: 'same' as const,
        feel: [...feel],
        energy: (energy === 'Slow' || energy === 'Steady' || energy === 'Fast' ? energy : 'Steady') as Energy,
        words: input.words,
      },
      ...(artistSlug ? { voiceSlug: artistSlug } : {}),
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  try {
    await adminNoteSongGenerationAccepted(song.id);
  } catch (error) {
    console.error('[beat-first] vocals clock', error instanceof Error ? error.message : 'failed');
  }
  try {
    await trackFunnelEvent(
      input.uid,
      'beat_picked',
      { songId: song.id, artistId: song.artistId },
      input.platform
    );
  } catch (error) {
    console.error('[funnel] beat_picked', error instanceof Error ? error.message : 'failed');
  }
  return { songId: song.id };
}

function accountForSong(song: SongDocument) {
  return {
    attempts: song.singOver?.attempts ?? 0,
    creditEstimate: song.singOver?.creditEstimate ?? null,
  };
}

async function publishFinished(song: SongDocument, beat: NonNullable<SongDocument['beatFirst']>): Promise<void> {
  const now = Timestamp.now();
  await getAdminDb().collection(COLLECTIONS.songs).doc(song.id).set(
    {
      audioReady: true,
      ...(song.publicOnReady === true ? { isPublic: true } : {}),
      generationStatus: FieldValue.delete(),
      beatFirst: beat,
      updatedAt: now,
    },
    { merge: true }
  );
  if (isFalCoverPipeline() && song.coverMotionStatus !== 'ready' && song.coverMotionStatus !== 'pending') {
    try {
      enqueueSongCoverGeneration(song.id);
    } catch (error) {
      console.error('[beat-first] cover', error instanceof Error ? error.message : 'failed');
    }
  }
  try {
    await adminCreateSongReadyNotification({
      userId: song.ownerId,
      songId: song.id,
      generationId: 'beat-first',
    });
  } catch (error) {
    console.error('[beat-first] notify', error instanceof Error ? error.message : 'failed');
  }
  notifyOwnerSongReady({
    ownerId: song.ownerId,
    title: song.title,
    songId: song.id,
    artistId: song.artistId,
  });
  try {
    await maybePostSongLive(song.id);
  } catch (error) {
    console.error('[beat-first] x', error instanceof Error ? error.message : 'failed');
  }
}

export async function keepBeatInstrumental(input: {
  songId: string;
  uid: string;
  versionId: string;
  platform: FunnelPlatform;
}): Promise<{ songId: string }> {
  const song = await ownedBeat(input.songId, input.uid);
  if (song.beatFirst?.stage !== 'ready') throw new HttpError(409, 'The beat is not ready');
  const version = await chosenBeatVersion(song, input.versionId);
  await adminSetPrimarySongVersion(song.id, version.id);
  const beat = beatOf(song);
  const createdAtMs = nowMs();
  const elapsed = msFromFirstBeat(timestampMillis(beat.firstBeatAt), createdAtMs);
  await getAdminDb().collection(COLLECTIONS.songs).doc(song.id).set(
    {
      createOptions: {
        instrumental: true,
        voice: 'same',
        feel: [...(song.createOptions?.feel ?? [])],
        energy:
          song.createOptions?.energy === 'Slow' ||
          song.createOptions?.energy === 'Steady' ||
          song.createOptions?.energy === 'Fast'
            ? song.createOptions.energy
            : 'Steady',
        words: 'artist',
      },
    },
    { merge: true }
  );
  await publishFinished(song, {
    ...beat,
    stage: 'instrumental',
    chosenVersionId: version.id,
    vocalsAdded: false,
  });
  try {
    await trackFunnelEvent(input.uid, 'beat_picked', { songId: song.id, artistId: song.artistId }, input.platform);
    await trackFunnelEvent(
      input.uid,
      'used_as_instrumental',
      {
        songId: song.id,
        artistId: song.artistId,
        vocalsAdded: false,
        ...(elapsed != null ? { msFromFirstBeat: elapsed } : {}),
      },
      input.platform
    );
  } catch (error) {
    console.error('[funnel] used_as_instrumental', error instanceof Error ? error.message : 'failed');
  }
  return { songId: song.id };
}

/**
 * The beat job failed before a file arrived. Leave the song retryable.
 * Does not publish it and does not start the finished-song clock.
 */
export async function noteBeatAttemptEnded(songId: string): Promise<void> {
  const song = await adminGetSong(songId);
  if (!song || song.path !== BEAT_FIRST_PATH) return;
  if (song.beatFirst?.stage !== 'generating') return;
  const beat = beatOf(song);
  await getAdminDb().collection(COLLECTIONS.songs).doc(song.id).set(
    {
      beatFirst: { ...beat, stage: 'ready' },
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

/** Webhook: a beat file landed. Do not publish and do not start the time-to-song clock. */
export async function noteBeatAudioStored(song: SongDocument): Promise<void> {
  if (song.path !== BEAT_FIRST_PATH) return;
  const fresh = (await adminGetSong(song.id)) ?? song;
  const stage = fresh.beatFirst?.stage;
  if (stage === 'vocals' || stage === 'instrumental') return;
  const beat = beatOf(fresh);
  if (beat.stage === 'singing') return;
  const now = Timestamp.now();
  await getAdminDb().collection(COLLECTIONS.songs).doc(song.id).set(
    {
      beatFirst: {
        ...beat,
        stage: 'ready',
        firstBeatAt: beat.firstBeatAt ?? now,
      },
      updatedAt: now,
    },
    { merge: true }
  );
}

/**
 * Webhook: the first vocal file for this Sing Over landed.
 * Returns whether to log vocals_added. Versions themselves are written by
 * the shared MusicGPT webhook, which is how the two takes reach songVersions.
 */
export async function noteSingOverFinished(
  song: SongDocument,
  generationId: string
): Promise<{ logVocals: boolean; msFromFirstBeat: number | null }> {
  if (song.path !== BEAT_FIRST_PATH) return { logVocals: false, msFromFirstBeat: null };
  const fresh = (await adminGetSong(song.id)) ?? song;
  if (fresh.beatFirst?.vocalsAdded === true || fresh.beatFirst?.stage === 'vocals') {
    return { logVocals: false, msFromFirstBeat: null };
  }
  const beat = beatOf(fresh);
  const now = Timestamp.now();
  const createdAtMs = nowMs();
  const elapsed = msFromFirstBeat(timestampMillis(beat.firstBeatAt), createdAtMs);
  await getAdminDb().collection(COLLECTIONS.songs).doc(song.id).set(
    {
      beatFirst: {
        ...beat,
        stage: 'vocals',
        vocalsAdded: true,
      },
      singOver: {
        attempts: fresh.singOver?.attempts ?? 1,
        creditEstimate: fresh.singOver?.creditEstimate ?? null,
        lastGenerationId: generationId,
      },
      updatedAt: now,
    },
    { merge: true }
  );
  return { logVocals: true, msFromFirstBeat: elapsed };
}

export function parseRetryRequest(raw: unknown): { feel: FeelLabel[]; energy: Energy } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'Invalid request');
  const body = raw as Record<string, unknown>;
  const parsed = parseCreateOptions({ feel: body.feel, energy: body.energy, instrumental: true, voice: 'same' });
  return { feel: parsed?.feel ?? [], energy: readEnergy(body.energy) };
}

function readEnergy(value: unknown): Energy {
  if (typeof value !== 'string') return 'Steady';
  const match = ENERGY_OPTIONS.find((option) => option.toLowerCase() === value.trim().toLowerCase());
  return match ?? 'Steady';
}

export function parseKeepRequest(raw: unknown): { versionId: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'Invalid request');
  const versionId = (raw as { versionId?: unknown }).versionId;
  if (typeof versionId !== 'string') throw new HttpError(400, 'versionId is required');
  const trimmed = versionId.trim();
  if (!trimmed || trimmed.length > 128 || trimmed.includes('/')) throw new HttpError(400, 'versionId is invalid');
  return { versionId: trimmed };
}
