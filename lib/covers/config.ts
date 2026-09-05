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
 *
 * Backfill (STR-52 PR3), admin/cron only — unset is a no-op:
 *   COVER_BACKFILL_ENABLED
 *   COVER_BACKFILL_CONCURRENCY (2–4, default 2)
 *   COVER_BACKFILL_BATCH_SIZE (default 4)
 *   COVER_BACKFILL_SCAN_LIMIT (default 100)
 */

const DEFAULT_FLUX_COVER_MODEL = 'fal-ai/flux/dev';
const DEFAULT_FLUX_COVER_I2I_MODEL = 'fal-ai/flux/dev/image-to-image';
const DEFAULT_LUMA_COVER_MODEL = 'fal-ai/luma-dream-machine/ray-2/image-to-video';

export function isFalCoverPipeline(): boolean {
  return process.env.COVER_PIPELINE?.trim().toLowerCase() === 'fal';
}

/**
 * MusicGPT album/cover song writes. Off when COVER_PIPELINE=fal (Streamstar
 * poster is SoT) or when a Flux poster already landed.
 */
export function shouldWriteMusicGptAlbumCover(song?: {
  coverPosterUrl?: string | null;
} | null): boolean {
  if (isFalCoverPipeline()) return false;
  if (song?.coverPosterUrl?.trim()) return false;
  return true;
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

/**
 * Auth for internal cover routes. Accepts `x-cover-job-secret` or
 * `Authorization: Bearer` matching COVER_JOB_SECRET / REVALIDATE_SECRET,
 * or Bearer CRON_SECRET (Vercel cron).
 */
export function isCoverJobAuthorized(request: {
  headers: { get(name: string): string | null };
}): boolean {
  const expected = getCoverJobSecret();
  const header = request.headers.get('x-cover-job-secret');
  if (expected && header && header === expected) {
    return true;
  }

  const auth = request.headers.get('authorization');
  const bearer = auth?.replace(/^Bearer\s+/i, '').trim() || '';
  if (expected && bearer && bearer === expected) {
    return true;
  }

  const cronSecret = process.env.CRON_SECRET?.trim();
  return Boolean(cronSecret && bearer && bearer === cronSecret);
}

function envFlagEnabled(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function parseEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Ops gate. Unset / false leaves the backfill route as a no-op. */
export function isCoverBackfillEnabled(): boolean {
  return envFlagEnabled('COVER_BACKFILL_ENABLED');
}

/** Concurrent Fal jobs per run. Clamped to 2–4. */
export function getCoverBackfillConcurrency(): number {
  return parseEnvInt('COVER_BACKFILL_CONCURRENCY', 2, 2, 4);
}

/** Songs to generate this run after newest-first scan. */
export function getCoverBackfillBatchSize(): number {
  return parseEnvInt('COVER_BACKFILL_BATCH_SIZE', 4, 1, 20);
}

/** Max songs inspected while filling a batch (includes already-ready). */
export function getCoverBackfillScanLimit(): number {
  return parseEnvInt('COVER_BACKFILL_SCAN_LIMIT', 100, 1, 500);
}
