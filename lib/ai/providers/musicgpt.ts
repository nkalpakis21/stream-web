/**
 * MusicGPT Provider
 *
 * This module encapsulates all direct interactions with the MusicGPT API.
 * Nothing outside of the AI provider layer should reference MusicGPT
 * specific details or environment variables.
 */

import { AIProvider, AIGenerationRequest, AIGenerationResponse } from '../types';
import { isFalCoverPipeline } from '@/lib/covers/config';
import { redactForLog, redactSecrets, redactUrl } from '@/lib/webhooks/redactUrl';

/**
 * MusicAI v2 default. Docs list v6 as the fast everyday model.
 * Do not send v7 / v7-pro from this path.
 */
export const MUSICGPT_DEFAULT_MODEL = 'v6';

export type MusicGptApiVersion = 'v1' | 'v2';

/**
 * `MUSICGPT_API_VERSION=v1` rolls the create call back to deprecated MusicAI.
 * Anything else, including unset, uses v2.
 */
export function musicGptApiVersion(
  raw: string | undefined = process.env.MUSICGPT_API_VERSION
): MusicGptApiVersion {
  return raw?.trim().toLowerCase() === 'v1' ? 'v1' : 'v2';
}

/**
 * Origin for `/api/public/{version}/...`.
 * `MUSICGPT_BASE_URL` may be the host or may already end in `/api/public/v1`.
 */
export function musicGptPublicOrigin(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  const match = trimmed.match(/^(.*)\/api\/public(?:\/v[12](?:\/.*)?)?$/i);
  if (match?.[1]) return match[1].replace(/\/+$/, '');
  return trimmed;
}

export function musicGptEndpointUrl(
  baseUrl: string,
  version: MusicGptApiVersion,
  endpoint: 'MusicAI' | 'byId'
): string {
  return `${musicGptPublicOrigin(baseUrl)}/api/public/${version}/${endpoint}`;
}

export function musicGptCreateUrl(
  baseUrl: string,
  version: MusicGptApiVersion = musicGptApiVersion()
): string {
  return musicGptEndpointUrl(baseUrl, version, 'MusicAI');
}

/** Conversion lookup stays on GET /v1/byId. */
export function musicGptByIdUrl(baseUrl: string): string {
  return musicGptEndpointUrl(baseUrl, 'v1', 'byId');
}

/**
 * MusicGPT covers when COVER_PIPELINE is not fal. Fal posters are the source
 * of truth once COVER_PIPELINE=fal, so we do not ask MusicGPT for a cover.
 */
export function musicGptGenerateAlbumCover(): boolean {
  return !isFalCoverPipeline();
}

export type MusicGptCreateInput = {
  prompt: string;
  lyrics?: string;
  music_style?: string;
  make_instrumental?: boolean;
  webhook_url?: string;
  title?: string;
};

/**
 * v2 needs lyrics_timestamps explicitly (the API default is false).
 * v1 does not document that flag or `model`, so rollback omits both.
 * `num_outputs` is not a documented MusicAI field and is not sent.
 */
export function buildMusicGptCreateBody(
  payload: MusicGptCreateInput,
  options?: { version?: MusicGptApiVersion; generateAlbumCover?: boolean }
): Record<string, unknown> {
  const version = options?.version ?? musicGptApiVersion();
  const body: Record<string, unknown> = {
    prompt: payload.prompt,
    make_instrumental: payload.make_instrumental ?? false,
    generate_album_cover: options?.generateAlbumCover ?? musicGptGenerateAlbumCover(),
  };
  if (payload.lyrics) body.lyrics = payload.lyrics;
  if (payload.music_style) body.music_style = payload.music_style;
  if (payload.webhook_url) body.webhook_url = payload.webhook_url;
  if (payload.title) body.title = payload.title;
  if (version === 'v2') {
    body.lyrics_timestamps = true;
    body.model = MUSICGPT_DEFAULT_MODEL;
  }
  return body;
}

/** Token embedded in the callback URL, used only to scrub logs. */
function callbackToken(webhookUrl?: string): string | null {
  if (!webhookUrl) return null;
  try {
    return new URL(webhookUrl).searchParams.get('token');
  } catch {
    return null;
  }
}

type ArtistContext = NonNullable<AIGenerationRequest['artistContext']>;

/** MusicGPT prompt guidance is ~280 chars; style can be longer, but keep it bounded. */
const MUSIC_STYLE_MAX_LENGTH = 1000;

/**
 * Map an artist's full style DNA into MusicGPT request fields.
 * Previously only genres[0] was sent as music_style.
 */
export function buildMusicGPTStyleFromArtistContext(artistContext?: ArtistContext): {
  music_style?: string;
  make_instrumental: boolean;
} {
  if (!artistContext) {
    return { make_instrumental: false };
  }

  const { styleDNA, lore } = artistContext;
  const parts: string[] = [];

  // Locked vocal identity first so every song for this artist shares it.
  // MusicGPT MusicAI has no persistent voice_id/clone on this endpoint.
  const vocal = artistContext.vocalIdentity?.trim();
  if (vocal) {
    parts.push(vocal);
  }

  const genres = (styleDNA.genres ?? []).map(value => value.trim()).filter(Boolean);
  if (genres.length > 0) {
    parts.push(genres.join(', '));
  }

  const moods = (styleDNA.moods ?? []).map(value => value.trim()).filter(Boolean);
  if (moods.length > 0) {
    parts.push(`mood: ${moods.join(', ')}`);
  }

  const tempoMin = styleDNA.tempoRange?.min;
  const tempoMax = styleDNA.tempoRange?.max;
  if (typeof tempoMin === 'number' && typeof tempoMax === 'number') {
    parts.push(`${tempoMin}-${tempoMax} BPM`);
  }

  const influences = (styleDNA.influences ?? []).map(value => value.trim()).filter(Boolean);
  if (influences.length > 0) {
    parts.push(`influences: ${influences.join(', ')}`);
  }

  const trimmedLore = lore?.trim() ?? '';
  const coreStyle = parts.join('. ');
  let music_style = coreStyle;
  if (trimmedLore) {
    music_style = coreStyle ? `${coreStyle}. ${trimmedLore}` : trimmedLore;
  }

  if (music_style.length > MUSIC_STYLE_MAX_LENGTH) {
    music_style = music_style.slice(0, MUSIC_STYLE_MAX_LENGTH).trimEnd();
  }

  return {
    ...(music_style ? { music_style } : {}),
    make_instrumental: trimmedLore.toLowerCase().includes('instrumental'),
  };
}

/**
 * Lazy getters for MusicGPT configuration.
 * These are checked at runtime rather than module load time to avoid
 * issues when this module is imported in client components where
 * server-side env vars aren't available.
 */
function getMusicGPTConfig() {
  const MUSICGPT_BASE_URL = process.env.MUSICGPT_BASE_URL;
  const MUSICGPT_API_KEY = process.env.MUSICGPT_API_KEY;

  // Only validate when actually using the provider (server-side)
  if (typeof window === 'undefined' && (!MUSICGPT_BASE_URL || !MUSICGPT_API_KEY)) {
    throw new Error(
      'MusicGPT configuration is missing. Ensure MUSICGPT_BASE_URL and MUSICGPT_API_KEY are set.'
    );
  }

  return { MUSICGPT_BASE_URL, MUSICGPT_API_KEY };
}

/**
 * Low-level API client for creating a MusicGPT song generation request.
 *
 * The exact payload shape is kept narrow and vendor-specific here so the rest
 * of the app can work with higher-level abstractions.
 */
export async function createMusicGPTSong(payload: MusicGptCreateInput) {
  const { MUSICGPT_BASE_URL, MUSICGPT_API_KEY } = getMusicGPTConfig();
  
  if (!MUSICGPT_BASE_URL || !MUSICGPT_API_KEY) {
    throw new Error('MusicGPT configuration is missing');
  }

  const url = musicGptCreateUrl(MUSICGPT_BASE_URL);
  const requestPayload = buildMusicGptCreateBody(payload);
  
  const callbackSecret = callbackToken(payload.webhook_url);
  console.log('[MusicGPT] Making request to:', redactUrl(url));
  console.log(
    '[MusicGPT] Payload:',
    JSON.stringify(redactForLog(requestPayload, callbackSecret), null, 2)
  );
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // MusicGPT uses the API key directly, not Bearer token
        Authorization: MUSICGPT_API_KEY,
      },
      body: JSON.stringify(requestPayload),
    });

    console.log('[MusicGPT] Response status:', res.status);
    console.log(
      '[MusicGPT] Response headers:',
      redactForLog(Object.fromEntries(res.headers.entries()), callbackSecret)
    );

    // Read response body as text first so we can log it
    const responseText = await res.text();
    const safeResponseText = redactSecrets(responseText, callbackSecret);
    console.log('[MusicGPT] Response body:', safeResponseText);

    if (!res.ok) {
      // Try to get error details from response
      let errorMessage = `MusicGPT request failed with status ${res.status}`;
      try {
        if (responseText) {
          console.error('[MusicGPT] Error response:', safeResponseText);
          try {
            const parsed = JSON.parse(responseText) as {
              error?: unknown;
              message?: unknown;
              detail?: unknown;
            };
            const detail = [parsed.error, parsed.message, parsed.detail].find(
              (value) => typeof value === 'string' && value.trim()
            );
            if (typeof detail === 'string') errorMessage = detail;
          } catch {
            // If not JSON, use the text as-is (truncated)
            errorMessage = `${errorMessage}: ${responseText.substring(0, 200)}`;
          }
        }
      } catch (e) {
        // Ignore errors reading error body
      }
      throw new Error(redactSecrets(errorMessage, callbackSecret));
    }

    // Parse the response body
    try {
      const responseData = JSON.parse(responseText);
      return responseData as {
        taskId?: string;
        id?: string;
        job_id?: string;
        [key: string]: unknown;
      };
    } catch (parseError) {
      console.error('[MusicGPT] Failed to parse response as JSON:', redactSecrets(responseText, callbackSecret));
      throw new Error('MusicGPT returned invalid JSON response');
    }
  } catch (error) {
    // Re-throw with more context if it's not already an Error
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(redactSecrets(`MusicGPT request failed: ${String(error)}`, callbackSecret));
  }
}

/**
 * Fetch conversion data by task ID from MusicGPT.
 * 
 * Returns the full conversion object which includes both conversion_id_1 and conversion_id_2,
 * along with all metadata, lyrics, and audio URLs.
 * 
 * @param taskId - The task ID from MusicGPT
 * @param conversionType - The type of conversion (default: "MUSIC_AI")
 * @returns Response with {success: true, conversion: {...}} or null if fetch fails
 */
export async function getConversionDataByTaskID(
  taskId: string,
  conversionType: string = 'MUSIC_AI'
): Promise<{ success: boolean; conversion: Record<string, unknown> } | null> {
  const { MUSICGPT_BASE_URL, MUSICGPT_API_KEY } = getMusicGPTConfig();

  if (!MUSICGPT_BASE_URL || !MUSICGPT_API_KEY) {
    console.warn('[MusicGPT] Missing API config, skipping conversion details fetch');
    return null;
  }

  try {
    const url = new URL(musicGptByIdUrl(MUSICGPT_BASE_URL));
    url.searchParams.append('conversionType', conversionType);
    url.searchParams.append('task_id', taskId);

    console.log('[MusicGPT] Fetching conversion data by task_id:', url.toString());

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        // MusicGPT uses the API key directly, not Bearer token
        'Authorization': MUSICGPT_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn(
        `[MusicGPT] Failed to fetch conversion data by task_id: ${response.status}`,
        errorText
      );
      return null;
    }

    const data = await response.json();
    console.log('[MusicGPT] Successfully fetched conversion data by task_id');
    return data as { success: boolean; conversion: Record<string, unknown> };
  } catch (error) {
    console.error('[MusicGPT] Error fetching conversion data by task_id:', error);
    return null;
  }
}

/**
 * Fetch conversion data by conversion ID from MusicGPT.
 * 
 * Returns the full conversion object which includes both conversion_id_1 and conversion_id_2,
 * along with all metadata, lyrics, and audio URLs.
 * 
 * @param conversionId - The conversion ID from MusicGPT
 * @param conversionType - The type of conversion (default: "MUSIC_AI")
 * @returns Response with {success: true, conversion: {...}} or null if fetch fails
 */
export async function getConversionDataByConversionID(
  conversionId: string,
  conversionType: string = 'MUSIC_AI'
): Promise<{ success: boolean; conversion: Record<string, unknown> } | null> {
  const { MUSICGPT_BASE_URL, MUSICGPT_API_KEY } = getMusicGPTConfig();

  if (!MUSICGPT_BASE_URL || !MUSICGPT_API_KEY) {
    console.warn('[MusicGPT] Missing API config, skipping conversion details fetch');
    return null;
  }

  try {
    const url = new URL(musicGptByIdUrl(MUSICGPT_BASE_URL));
    url.searchParams.append('conversionType', conversionType);
    url.searchParams.append('conversion_id', conversionId);

    console.log('[MusicGPT] Fetching conversion data by conversion_id:', url.toString());

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        // MusicGPT uses the API key directly, not Bearer token
        'Authorization': MUSICGPT_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn(
        `[MusicGPT] Failed to fetch conversion data by conversion_id: ${response.status}`,
        errorText
      );
      return null;
    }

    const data = await response.json();
    console.log('[MusicGPT] Successfully fetched conversion data by conversion_id');
    return data as { success: boolean; conversion: Record<string, unknown> };
  } catch (error) {
    console.error('[MusicGPT] Error fetching conversion data by conversion_id:', error);
    return null;
  }
}

/**
 * MusicGPT AIProvider implementation.
 *
 * Note: MusicGPT is asynchronous – it does not return final audio here.
 * We use the provider purely to register the remote task and return
 * metadata (taskId) to the caller. Audio URLs arrive later via webhook.
 */
export class MusicGPTProvider implements AIProvider {
  readonly id = 'musicgpt';
  readonly name = 'MusicGPT';

  isAvailable(): boolean {
    // Always return true - actual API calls happen server-side via API route
    // This allows the provider to be selected in the UI
    return true;
  }

  async generateSong(request: AIGenerationRequest): Promise<AIGenerationResponse> {
    const style = buildMusicGPTStyleFromArtistContext(request.artistContext);
    const response = await createMusicGPTSong({
      prompt: request.prompt.freeText,
      ...style,
    });

    // Try a few common keys for the remote task identifier.
    const taskId =
      (response.taskId as string | undefined) ||
      (response.job_id as string | undefined) ||
      (response.id as string | undefined) ||
      `musicgpt-${Date.now()}`;

    return {
      // No audio URL yet – webhook will supply this later.
      audioURL: '',
      stems: [],
      metadata: {
        taskId,
        raw: response,
      },
      provider: this.id,
      generationId: taskId,
    };
  }
}


