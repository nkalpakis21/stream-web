/**
 * MusicGPT stem extraction for a finished mix.
 *
 * POST /api/public/v2/Extraction is multipart. The song is uploaded as
 * `audio_file`. `audio_url` is YouTube-only and is never sent.
 * `stem_preset=2_stems` returns vocals and instrumental. An explicit `stems`
 * list is billed even when it matches a preset, so this call never sends one.
 * During November 2026, preset extraction is free on paid plans within quota.
 * https://docs.musicgpt.com/api-documentation/conversions/extraction
 */

import { musicGptPublicOrigin } from '@/lib/ai/providers/musicgpt';
import { readMusicGptCreditEstimate } from '@/lib/server/musicgptUsage';
import { isMusicGptAudioUrl } from '@/lib/server/songAudioUrl';
import { downloadSourceAudio } from '@/lib/server/singOver';

export const EXTRACTION_PATH = '/api/public/v2/Extraction';
export const STEM_PRESET_2 = '2_stems' as const;
/** MusicGPT refuses extraction longer than this. Sing Over's own cap is shorter. */
export const EXTRACTION_MAX_SECONDS = 8 * 60;

export function musicGptExtractionUrl(baseUrl: string): string {
  return `${musicGptPublicOrigin(baseUrl)}${EXTRACTION_PATH}`;
}

export type ExtractionTextFields = {
  stem_preset: typeof STEM_PRESET_2;
  webhook_url?: string;
};

/** Text fields for the multipart body. No `stems`, no `audio_url`. */
export function extractionTextFields(webhookUrl?: string | null): ExtractionTextFields {
  const fields: ExtractionTextFields = { stem_preset: STEM_PRESET_2 };
  const webhook = webhookUrl?.trim();
  if (webhook) fields.webhook_url = webhook;
  return fields;
}

export function extractionBodySendsStemsOrAudioUrl(fields: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(fields, 'stems') ||
    Object.prototype.hasOwnProperty.call(fields, 'audio_url')
  );
}

export function buildExtractionForm(
  fields: ExtractionTextFields,
  audio: { bytes: Uint8Array; contentType: string; filename: string }
): FormData {
  if (extractionBodySendsStemsOrAudioUrl(fields as unknown as Record<string, unknown>)) {
    throw new Error('Extraction must not send stems or audio_url');
  }
  const form = new FormData();
  const copy = audio.bytes.buffer.slice(
    audio.bytes.byteOffset,
    audio.bytes.byteOffset + audio.bytes.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([copy], { type: audio.contentType || 'audio/mpeg' });
  form.append('audio_file', blob, audio.filename || 'song.mp3');
  form.append('stem_preset', fields.stem_preset);
  if (fields.webhook_url) form.append('webhook_url', fields.webhook_url);
  return form;
}

export type StemSplitResult = {
  taskId: string;
  conversionId: string | null;
  creditEstimate: number | null;
  isFreePromo: boolean;
  raw: Record<string, unknown>;
};

export function readStemSplitTask(response: Record<string, unknown>): StemSplitResult {
  const taskId =
    (typeof response.task_id === 'string' && response.task_id) ||
    (typeof response.taskId === 'string' && response.taskId) ||
    '';
  if (!taskId) throw new Error('Stem split did not return a task id');
  const conversionId =
    (typeof response.conversion_id === 'string' && response.conversion_id) ||
    (typeof response.conversionId === 'string' && response.conversionId) ||
    null;
  return {
    taskId,
    conversionId,
    creditEstimate: readMusicGptCreditEstimate(response),
    isFreePromo: response.is_free_promo === true,
    raw: response,
  };
}

function stemRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

/** Instrumental URL from an Extraction webhook. Other hosts are ignored. */
export function instrumentalUrlFromExtraction(body: { audio_url?: unknown }): string | null {
  const stems = stemRecord(body.audio_url);
  const url = typeof stems?.instrumental === 'string' ? stems.instrumental.trim() : '';
  if (!url || !isMusicGptAudioUrl(url)) return null;
  return url;
}

export function isMusicGptExtractionEvent(body: { conversion_type?: unknown }): boolean {
  return typeof body.conversion_type === 'string' && body.conversion_type.trim().toLowerCase() === 'extraction';
}

export type StemSplitDeps = {
  fetchImpl?: typeof fetch;
  download?: typeof downloadSourceAudio;
};

export async function submitStemExtraction(
  input: { sourceAudioUrl: string; webhookUrl?: string | null },
  deps: StemSplitDeps = {}
): Promise<StemSplitResult> {
  const baseUrl = process.env.MUSICGPT_BASE_URL;
  const apiKey = process.env.MUSICGPT_API_KEY;
  if (!baseUrl || !apiKey) throw new Error('MusicGPT configuration is missing');
  const download = deps.download ?? downloadSourceAudio;
  const audio = await download(input.sourceAudioUrl, deps.fetchImpl);
  const fields = extractionTextFields(input.webhookUrl);
  const form = buildExtractionForm(fields, audio);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchImpl(musicGptExtractionUrl(baseUrl), {
    method: 'POST',
    headers: { Authorization: apiKey },
    body: form,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Stem split request failed with status ${response.status}`);
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('Stem split returned invalid JSON');
  }
  if (parsed.success === false) {
    throw new Error('Stem split request failed');
  }
  return readStemSplitTask(parsed);
}
