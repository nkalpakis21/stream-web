/**
 * Fal cover pipeline flags and model ids (STR-52 PR1).
 *
 * COVER_PIPELINE=fal — new gens use Flux poster + Luma Ray loop.
 * Unset / any other value keeps MusicGPT still album covers.
 *
 * Optional model overrides (server-only):
 *   FAL_FLUX_COVER_MODEL
 *   FAL_FLUX_COVER_I2I_MODEL
 *   FAL_LUMA_COVER_MODEL
 */

const DEFAULT_FLUX_COVER_MODEL = 'fal-ai/flux/dev';
const DEFAULT_FLUX_COVER_I2I_MODEL = 'fal-ai/flux/dev/image-to-image';
const DEFAULT_LUMA_COVER_MODEL = 'fal-ai/luma-dream-machine/ray-2/image-to-video';

export function isFalCoverPipeline(): boolean {
  return process.env.COVER_PIPELINE?.trim().toLowerCase() === 'fal';
}

/** MusicGPT album/cover webhook writes are ignored when the Fal pipeline is on. */
export function shouldWriteMusicGptAlbumCover(): boolean {
  return !isFalCoverPipeline();
}

export function getFalFluxCoverModel(imageToImage: boolean): string {
  if (imageToImage) {
    return (
      process.env.FAL_FLUX_COVER_I2I_MODEL?.trim() || DEFAULT_FLUX_COVER_I2I_MODEL
    );
  }
  return process.env.FAL_FLUX_COVER_MODEL?.trim() || DEFAULT_FLUX_COVER_MODEL;
}

export function getFalLumaCoverModel(): string {
  return process.env.FAL_LUMA_COVER_MODEL?.trim() || DEFAULT_LUMA_COVER_MODEL;
}

export function getCoverJobSecret(): string {
  return (
    process.env.COVER_JOB_SECRET?.trim() ||
    process.env.REVALIDATE_SECRET?.trim() ||
    ''
  );
}
