/**
 * GET /api/cron/x-posts
 *
 * Vercel cron, once a day at 15:00 UTC. Hobby plans reject a schedule that
 * runs more than once a day, which fails the whole deployment.
 * Authorization: Bearer CRON_SECRET.
 * Posts cap-deferred songs whose quiet period has opened, and marks
 * skipped_stale when a song missed the 24h window. One post per song.
 * The MusicGPT webhook also runs a short sweep when a song finishes, so a
 * deferred post does not have to wait for the daily run.
 *
 * CRON_SECRET  Required. Unset rejects every request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isMintSweepAuthorized } from '@/lib/server/mintSweep';
import { sweepDeferredXPosts } from '@/lib/x/postSong';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isMintSweepAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await sweepDeferredXPosts();
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[x-posts] sweep failed', err);
    return NextResponse.json({ ok: false, error: 'Sweep failed' }, { status: 500 });
  }
}
