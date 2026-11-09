import { reportClientFunnelEvent } from '@/lib/analytics/reportFunnel';

/** A track started on /songs/[id]. Logged-out visitors are anonymous plays. */
export function reportSharePagePlay(songId: string, artistId?: string): void {
  try {
    reportClientFunnelEvent('play', {
      songId,
      ...(artistId ? { artistId } : {}),
      source: 'share_page',
    });
  } catch (error) {
    console.error('[funnel] play', error instanceof Error ? error.message : 'failed');
  }
}
