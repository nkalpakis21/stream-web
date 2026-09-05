/**
 * Fal-hosted Flux image generation (artist looks + song cover posters)
 * and Luma Ray image-to-video (song cover loops).
 *
 * Env: FAL_KEY — Fal.ai API key. Server-side only; never expose to the client.
 * If FAL_KEY is unset, look generation is disabled. Do not invent a key and
 * do not return fake images. Artist create still works with a placeholder /
 * no avatar. Existing artists can lock a look from the artist page.
 *
 * Cover pipeline (COVER_PIPELINE=fal) also uses FAL_KEY. Optional overrides:
 * FAL_FLUX_COVER_MODEL, FAL_FLUX_COVER_I2I_MODEL, FAL_LUMA_COVER_MODEL.
 *
 * Hosted Flux / Luma via Fal only — no model training, no in-house GPUs.
 */

import { fal } from '@fal-ai/client';
import { getFalFluxCoverModel, getFalLumaCoverModel } from '@/lib/covers/config';
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

interface FalVideo {
  url?: string;
}

interface FalVideoResult {
  data?: {
    video?: FalVideo;
    url?: string;
  };
  video?: FalVideo;
  url?: string;
  requestId?: string;
  request_id?: string;
}

export interface GeneratedCoverAsset {
  url: string;
  model: string;
  requestId?: string;
}

function extractRequestId(result: { requestId?: string; request_id?: string }): string | undefined {
  return result.requestId || result.request_id || undefined;
}

function extractVideoUrl(result: FalVideoResult): string | undefined {
  return result.data?.video?.url || result.video?.url || result.data?.url || result.url;
}

/**
 * One Flux poster still for a song cover. Song covers are text-to-image
 * from the song scene. Optional referenceImageUrl switches to i2i; the
 * song job does not pass the artist look.
 */
export async function generateCoverPoster(input: {
  prompt: string;
  referenceImageUrl?: string;
}): Promise<GeneratedCoverAsset> {
  if (!isFalConfigured()) {
    throw new Error(
      'Cover poster generation is not configured. Set the FAL_KEY env var to enable Flux via Fal.'
    );
  }

  const referenceImageUrl = input.referenceImageUrl?.trim();
  const model = getFalFluxCoverModel(Boolean(referenceImageUrl));

  const result = referenceImageUrl
    ? ((await fal.subscribe(model, {
        input: {
          prompt: input.prompt,
          image_url: referenceImageUrl,
          num_images: 1,
          strength: 0.65,
          output_format: 'jpeg',
        },
      })) as FalImageResult & { requestId?: string; request_id?: string })
    : ((await fal.subscribe(model, {
        input: {
          prompt: input.prompt,
          image_size: 'square_hd',
          num_images: 1,
          output_format: 'jpeg',
        },
      })) as FalImageResult & { requestId?: string; request_id?: string });

  const url = extractImageUrls(result)[0];
  if (!url) {
    throw new Error('Fal Flux returned no cover poster image.');
  }

  return { url, model, requestId: extractRequestId(result) };
}

/**
 * Luma Ray image-to-video (~5s) with loop: true. Motion should stay abstract.
 */
export async function generateCoverLoop(input: {
  prompt: string;
  imageUrl: string;
}): Promise<GeneratedCoverAsset> {
  if (!isFalConfigured()) {
    throw new Error(
      'Cover loop generation is not configured. Set the FAL_KEY env var to enable Luma Ray via Fal.'
    );
  }

  const model = getFalLumaCoverModel();
  const result = (await fal.subscribe(model, {
    input: {
      prompt: input.prompt,
      image_url: input.imageUrl,
      loop: true,
      duration: '5s',
      aspect_ratio: '4:3',
      resolution: '540p',
    },
  })) as FalVideoResult;

  const url = extractVideoUrl(result);
  if (!url) {
    throw new Error('Fal Luma Ray returned no cover loop video.');
  }

  return { url, model, requestId: extractRequestId(result) };
}

export { FAL_KEY_MISSING_MESSAGE };
