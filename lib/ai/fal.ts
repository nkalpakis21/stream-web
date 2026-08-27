/**
 * Fal-hosted Flux image generation (create-time artist looks only).
 *
 * Env: FAL_KEY — Fal.ai API key. Server-side only; never expose to the client.
 * If FAL_KEY is unset, look generation is disabled. Do not invent a key and
 * do not return fake images. Artist create still works with a placeholder /
 * no avatar.
 *
 * Hosted Flux via Fal only — no model training, no in-house GPUs.
 */

import { fal } from '@fal-ai/client';
import { buildArtistLookPrompt, type ArtistLookPromptInput } from './artistLook';

const FLUX_TEXT_TO_IMAGE = 'fal-ai/flux/dev';
const FLUX_IMAGE_TO_IMAGE = 'fal-ai/flux/dev/image-to-image';
export const ARTIST_LOOK_COUNT = 4;

export function isFalConfigured(): boolean {
  return Boolean(process.env.FAL_KEY?.trim());
}

const FAL_KEY_MISSING_MESSAGE =
  'Look generation is not configured. Set the FAL_KEY env var to enable Flux via Fal. You can still create an artist without an avatar.';

interface FalImage {
  url?: string;
}

interface FalImageResult {
  data?: {
    images?: FalImage[];
  };
  images?: FalImage[];
}

export interface GeneratedArtistLook {
  url: string;
}

export interface GenerateArtistLooksInput extends ArtistLookPromptInput {
  /** Optional reference photo as a data URI or public URL. Scratch (text-only) is the default. */
  referenceImage?: string;
}

function extractImageUrls(result: FalImageResult): string[] {
  const images = result.data?.images ?? result.images ?? [];
  return images
    .map(image => image.url)
    .filter((url): url is string => Boolean(url));
}

export async function generateArtistLooks(
  input: GenerateArtistLooksInput
): Promise<GeneratedArtistLook[]> {
  if (!isFalConfigured()) {
    throw new Error(FAL_KEY_MISSING_MESSAGE);
  }

  const prompt = buildArtistLookPrompt({
    ...input,
    hasReference: Boolean(input.referenceImage),
  });

  const referenceImage = input.referenceImage;
  const result = referenceImage
    ? ((await fal.subscribe(FLUX_IMAGE_TO_IMAGE, {
        input: {
          prompt,
          image_url: referenceImage,
          num_images: ARTIST_LOOK_COUNT,
          // Lower than Fal's 0.95 default so the reference face is preserved.
          strength: 0.7,
          output_format: 'jpeg',
        },
      })) as FalImageResult)
    : ((await fal.subscribe(FLUX_TEXT_TO_IMAGE, {
        input: {
          prompt,
          image_size: 'square_hd',
          num_images: ARTIST_LOOK_COUNT,
          output_format: 'jpeg',
        },
      })) as FalImageResult);

  const urls = extractImageUrls(result);
  if (urls.length === 0) {
    throw new Error('Fal Flux returned no images. Try again or create the artist without a look.');
  }

  return urls.map(url => ({ url }));
}

export { FAL_KEY_MISSING_MESSAGE };
