import { NextRequest, NextResponse } from 'next/server';
import {
  decodeBackfillCursor,
  runCoverBackfill,
} from '@/lib/covers/backfill';
import {
  getCoverBackfillBatchSize,
  getCoverBackfillConcurrency,
  isCoverBackfillEnabled,
  isCoverJobAuthorized,
  isFalCoverPipeline,
} from '@/lib/covers/config';

/**
 * GET/POST /api/covers/backfill
 * Internal newest-first Streamstar cover backfill. Does not touch audio paths.
 *
 * Auth: x-cover-job-secret or Authorization Bearer
 *   (COVER_JOB_SECRET, else REVALIDATE_SECRET; Bearer CRON_SECRET also ok).
 * Gate: COVER_BACKFILL_ENABLED=true. Ops flip this; unset is a no-op.
 * Env: COVER_PIPELINE=fal, FAL_KEY, Firebase Admin + Storage.
 *
 * Cursor: ?cursor=createdAtMs:songId (or JSON body) to resume newest-first scan.
 * dryRun=1 lists the next batch without calling Fal.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function readFlag(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function readPositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.floor(parsed));
}

async function handle(request: NextRequest) {
  if (!isCoverJobAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isCoverBackfillEnabled()) {
    return NextResponse.json(
      { ok: true, skipped: true, reason: 'COVER_BACKFILL_ENABLED is not set' },
      { status: 200 }
    );
  }

  if (!isFalCoverPipeline()) {
    return NextResponse.json(
      { ok: true, skipped: true, reason: 'COVER_PIPELINE is not fal' },
      { status: 200 }
    );
  }

  try {
    const url = request.nextUrl;
    const body =
      request.method === 'POST'
        ? ((await request.json().catch(() => ({}))) as {
            cursor?: string;
            limit?: number;
            batchSize?: number;
            dryRun?: boolean;
          })
        : {};

    const cursor = decodeBackfillCursor(
      typeof body.cursor === 'string' ? body.cursor : url.searchParams.get('cursor')
    );
    const envBatch = getCoverBackfillBatchSize();
    const requestedLimit = url.searchParams.get('limit') ?? body.limit ?? body.batchSize;
    const batchSize = readPositiveInt(requestedLimit, envBatch, envBatch);
    const dryRun =
      readFlag(url.searchParams.get('dryRun')) ||
      readFlag(url.searchParams.get('dry_run')) ||
      body.dryRun === true;

    const result = await runCoverBackfill({
      cursor,
      batchSize,
      concurrency: getCoverBackfillConcurrency(),
      dryRun,
    });

    // Per-song Fal failures stay 200 (fail-soft). Config/init errors are 500.
    const status = result.reason === 'Firebase Admin is not initialized' ? 500 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cover backfill failed';
    console.error('[API /covers/backfill]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
