/**
 * Browser reports for events the server cannot see on its own.
 * play and song_shared go to POST /api/funnel and are stored every time.
 * Artist create and look-lock go to POST /api/artists/[id]/funnel, which
 * re-reads the artist and chooses the first-time event. Neither call changes the UI.
 *
 * Web always sends `x-streamstar-platform: web`.
 */

import { auth } from '@/lib/firebase/config';
import { webPlatformHeaders } from '@/lib/funnel/platform';

export type ClientFunnelEvent = 'play' | 'song_shared';

function logFailure(event: string, error: unknown): void {
  console.error('[funnel]', event, error instanceof Error ? error.message : 'failed');
}

export function reportClientFunnelEvent(
  event: ClientFunnelEvent,
  props?: { songId?: string; artistId?: string }
): void {
  try {
    const user = auth.currentUser;
    if (!user) return;
    void (async () => {
      try {
        const token = await user.getIdToken();
        await fetch('/api/funnel', {
          method: 'POST',
          keepalive: true,
          headers: webPlatformHeaders({
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            event,
            ...(props?.songId ? { songId: props.songId } : {}),
            ...(props?.artistId ? { artistId: props.artistId } : {}),
          }),
        });
      } catch (error) {
        logFailure(event, error);
      }
    })();
  } catch (error) {
    logFailure(event, error);
  }
}

/** Ask the server to record artist_created / face_set after the client write. */
export function reportArtistObserved(artistId: string): void {
  try {
    const user = auth.currentUser;
    if (!user || !artistId) return;
    void (async () => {
      try {
        const token = await user.getIdToken();
        await fetch(`/api/artists/${encodeURIComponent(artistId)}/funnel`, {
          method: 'POST',
          keepalive: true,
          headers: webPlatformHeaders({ Authorization: `Bearer ${token}` }),
        });
      } catch (error) {
        logFailure('artist', error);
      }
    })();
  } catch (error) {
    logFailure('artist', error);
  }
}
