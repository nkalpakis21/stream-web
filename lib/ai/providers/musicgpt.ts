/**
 * MusicGPT Provider
 *
 * This module encapsulates all direct interactions with the MusicGPT API.
 * Nothing outside of the AI provider layer should reference MusicGPT
 * specific details or environment variables.
 */

import { AIProvider, AIGenerationRequest, AIGenerationResponse } from '../types';

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
export async function createMusicGPTSong(payload: {
  prompt: string;
  lyrics?: string;
  music_style?: string;
  isInstrumental?: boolean;
  webhook_url?: string;
}) {
  const { MUSICGPT_BASE_URL, MUSICGPT_API_KEY } = getMusicGPTConfig();
  
  if (!MUSICGPT_BASE_URL || !MUSICGPT_API_KEY) {
    throw new Error('MusicGPT configuration is missing');
  }

  const url = `${MUSICGPT_BASE_URL}/MusicAI`;
  
  // Include webhook_url in payload if provided
  const requestPayload: Record<string, unknown> = {
    prompt: payload.prompt,
    ...(payload.lyrics && { lyrics: payload.lyrics }),
    ...(payload.music_style && { music_style: payload.music_style }),
    ...(payload.isInstrumental !== undefined && { isInstrumental: payload.isInstrumental }),
    ...(payload.webhook_url && { webhook_url: payload.webhook_url }),
  };
  
  console.log('[MusicGPT] Making request to:', url);
  console.log('[MusicGPT] Payload:', JSON.stringify(requestPayload, null, 2));
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MUSICGPT_API_KEY}`,
      },
      body: JSON.stringify(requestPayload),
    });

    console.log('[MusicGPT] Response status:', res.status);
    console.log('[MusicGPT] Response headers:', Object.fromEntries(res.headers.entries()));

    // Read response body as text first so we can log it
    const responseText = await res.text();
    console.log('[MusicGPT] Response body:', responseText);

    if (!res.ok) {
      // Try to get error details from response
      let errorMessage = `MusicGPT request failed with status ${res.status}`;
      try {
        if (responseText) {
          // Log error body for debugging (but don't expose in production)
          console.error('[MusicGPT] Error response:', responseText);
          try {
            const parsed = JSON.parse(responseText);
            errorMessage = parsed.error || parsed.message || parsed.detail || errorMessage;
          } catch {
            // If not JSON, use the text as-is (truncated)
            errorMessage = `${errorMessage}: ${responseText.substring(0, 200)}`;
          }
        }
      } catch (e) {
        // Ignore errors reading error body
      }
      throw new Error(errorMessage);
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
      console.error('[MusicGPT] Failed to parse response as JSON:', responseText);
      throw new Error('MusicGPT returned invalid JSON response');
    }
  } catch (error) {
    // Re-throw with more context if it's not already an Error
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`MusicGPT request failed: ${String(error)}`);
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
    const response = await createMusicGPTSong({
      prompt: request.prompt.freeText,
      // These mappings can be extended once the exact MusicGPT
      // API surface for style / lyrics is finalized.
      music_style: (request.artistContext?.styleDNA.genres ?? [])[0],
      isInstrumental: request.artistContext?.lore
        ? request.artistContext.lore.toLowerCase().includes('instrumental')
        : false,
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


