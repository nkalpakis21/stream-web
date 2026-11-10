/**
 * MusicGPT Sing Over a finished instrumental.
 *
 * Shared by beat-first and, later, "Change the voice" (same beat and words,
 * a new voice, two takes). Nothing in here is beat-first specific.
 *
 * POST /v1/sing_over_instrumental is multipart. The source audio is uploaded
 * as `audio_file` bytes. `audio_url` is YouTube-only and is never sent.
 * https://docs.musicgpt.com/api-documentation/conversions/singover
 */

import { musicGptPublicOrigin } from '@/lib/ai/providers/musicgpt';
import { readMusicGptCreditEstimate } from '@/lib/server/musicgptUsage';
import { isMusicGptAudioUrl, isOurStorageAudioUrl } from '@/lib/server/songAudioUrl';
import { accountSingOver, type SingOverAccount } from '@/lib/songs/beatFirst';

export const SING_OVER_PATH = '/api/public/v1/sing_over_instrumental';

/** Refuse a download larger than a normal song file. */
export const SING_OVER_MAX_BYTES = 20 * 1024 * 1024;

export type SingOverVoice = 'same' | 'female' | 'male';

export type SingOverTextFields = {
  prompt: string;
  lyrics: string;
  gender?: 'female' | 'male';
  webhook_url?: string;
  title?: string;
};

export function musicGptSingOverUrl(baseUrl: string): string {
  return `${musicGptPublicOrigin(baseUrl)}${SING_OVER_PATH}`;
}

/** `same` omits gender so MusicGPT keeps the artist's voice. */
export function singOverGender(voice: SingOverVoice): 'female' | 'male' | undefined {
  if (voice === 'female' || voice === 'male') return voice;
  return undefined;
}

/**
 * Text fields for the multipart body. `audio_file` is attached separately.
 * This object never includes `audio_url`.
 */
export function singOverTextFields(input: {
  prompt: string;
  lyrics: string;
  voice: SingOverVoice;
  webhookUrl?: string | null;
  title?: string | null;
}): SingOverTextFields {
  const fields: SingOverTextFields = {
    prompt: input.prompt.trim(),
    lyrics: input.lyrics.trim(),
  };
  const gender = singOverGender(input.voice);
  if (gender) fields.gender = gender;
  const webhook = input.webhookUrl?.trim();
  if (webhook) fields.webhook_url = webhook;
  const title = input.title?.trim();
  if (title) fields.title = title;
  return fields;
}

export function singOverBodyHasAudioUrl(fields: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(fields, 'audio_url');
}

export function buildSingOverForm(
  fields: SingOverTextFields,
  audio: { bytes: Uint8Array; contentType: string; filename: string }
): FormData {
  if (singOverBodyHasAudioUrl(fields as unknown as Record<string, unknown>)) {
    throw new Error('Sing Over must not send audio_url');
  }
  const form = new FormData();
  const copy = audio.bytes.buffer.slice(
    audio.bytes.byteOffset,
    audio.bytes.byteOffset + audio.bytes.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([copy], { type: audio.contentType || 'audio/mpeg' });
  form.append('audio_file', blob, audio.filename || 'beat.mp3');
  form.append('prompt', fields.prompt);
  form.append('lyrics', fields.lyrics);
  if (fields.gender) form.append('gender', fields.gender);
  if (fields.webhook_url) form.append('webhook_url', fields.webhook_url);
  if (fields.title) form.append('title', fields.title);
  return form;
}

function storageBucketName(): string {
  return (
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    ''
  )
    .replace(/^gs:\/\//, '')
    .trim();
}

/** Only hosts we already store audio on. The caller passes a saved version URL. */
export function canDownloadSourceAudio(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (isMusicGptAudioUrl(trimmed)) return true;
  const bucket = storageBucketName();
  if (bucket && isOurStorageAudioUrl(trimmed, bucket)) return true;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return (
      host === 'firebasestorage.googleapis.com' ||
      host === 'storage.googleapis.com'
    );
  } catch {
    return false;
  }
}

export async function downloadSourceAudio(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> {
  if (!canDownloadSourceAudio(url)) {
    throw new Error('Source audio host is not allowed');
  }
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Source audio download failed with status ${response.status}`);
  }
  const length = Number(response.headers.get('content-length') || '');
  if (Number.isFinite(length) && length > SING_OVER_MAX_BYTES) {
    throw new Error('Source audio is too large');
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength === 0 || buffer.byteLength > SING_OVER_MAX_BYTES) {
    throw new Error('Source audio is too large');
  }
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'audio/mpeg';
  return { bytes: buffer, contentType, filename: 'source.mp3' };
}

export type SingOverSubmitResult = {
  taskId: string;
  conversionIds: string[];
  creditEstimate: number | null;
  raw: Record<string, unknown>;
};

export function readSingOverTask(response: Record<string, unknown>): SingOverSubmitResult {
  const taskId =
    (typeof response.task_id === 'string' && response.task_id) ||
    (typeof response.taskId === 'string' && response.taskId) ||
    (typeof response.job_id === 'string' && response.job_id) ||
    (typeof response.id === 'string' && response.id) ||
    '';
  if (!taskId) throw new Error('Sing Over did not return a task id');
  const conversionIds: string[] = [];
  if (typeof response.conversion_id_1 === 'string' && response.conversion_id_1) {
    conversionIds.push(response.conversion_id_1);
  }
  if (typeof response.conversion_id_2 === 'string' && response.conversion_id_2) {
    conversionIds.push(response.conversion_id_2);
  }
  const listed = response.conversion_ids;
  if (Array.isArray(listed)) {
    for (const id of listed) {
      if (typeof id === 'string' && id && !conversionIds.includes(id)) conversionIds.push(id);
    }
  }
  return {
    taskId,
    conversionIds,
    creditEstimate: readMusicGptCreditEstimate(response),
    raw: response,
  };
}

export type SingOverSubmitInput = {
  sourceAudioUrl: string;
  prompt: string;
  lyrics: string;
  voice: SingOverVoice;
  webhookUrl?: string | null;
  title?: string | null;
};

export type SingOverDeps = {
  fetchImpl?: typeof fetch;
  download?: typeof downloadSourceAudio;
  now?: () => number;
};

/**
 * Download the source audio and POST it as `audio_file`.
 * Cost is the provider credit_estimate when the response includes one.
 * `cap` limits how many Sing Over jobs this song may start. Null does not limit.
 */
export async function submitSingOver(
  input: SingOverSubmitInput,
  account: { current: SingOverAccount | null; cap: number | null },
  deps: SingOverDeps = {}
): Promise<{ result: SingOverSubmitResult; account: SingOverAccount }> {
  const prompt = input.prompt.trim();
  const lyrics = input.lyrics.trim();
  if (!prompt) throw new Error('Sing Over prompt is required');
  if (!lyrics) throw new Error('Sing Over lyrics are required');
  const gate = accountSingOver(account.current, null, account.cap);
  if (!gate.ok) throw new Error('Sing Over cap reached');

  const baseUrl = process.env.MUSICGPT_BASE_URL;
  const apiKey = process.env.MUSICGPT_API_KEY;
  if (!baseUrl || !apiKey) throw new Error('MusicGPT configuration is missing');

  const download = deps.download ?? downloadSourceAudio;
  const audio = await download(input.sourceAudioUrl, deps.fetchImpl);
  const fields = singOverTextFields({
    prompt,
    lyrics,
    voice: input.voice,
    webhookUrl: input.webhookUrl,
    title: input.title,
  });
  const form = buildSingOverForm(fields, audio);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchImpl(musicGptSingOverUrl(baseUrl), {
    method: 'POST',
    headers: { Authorization: apiKey },
    body: form,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Sing Over request failed with status ${response.status}`);
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('Sing Over returned invalid JSON');
  }
  const result = readSingOverTask(parsed);
  const booked = accountSingOver(account.current, result.creditEstimate, account.cap);
  return { result, account: booked.ok ? booked.account : gate.account };
}
