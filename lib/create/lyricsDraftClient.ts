/**
 * Browser call for POST /api/lyrics/draft.
 * The panel does not import Firebase itself so render tests stay offline.
 */

import { auth } from '@/lib/firebase/config';
import type { LyricsDraftResult } from '@/lib/create/songOptions';
import { webPlatformHeaders } from '@/lib/funnel/platform';

export type { LyricsDraftResult };

export async function requestLyricsDraft(input: {
  sessionId: string;
  prompt: string;
  artistId?: string | null;
  style?: {
    name?: string | null;
    genres?: string[];
    moods?: string[];
    vocalIdentity?: string | null;
    lore?: string | null;
  } | null;
}): Promise<LyricsDraftResult> {
  const user = auth.currentUser;
  if (!user) {
    return { lyrics: '', remaining: 3, error: 'Sign in to write a draft.' };
  }
  const token = await user.getIdToken();
  const response = await fetch('/api/lyrics/draft', {
    method: 'POST',
    headers: webPlatformHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }),
    body: JSON.stringify({
      sessionId: input.sessionId,
      prompt: input.prompt,
      ...(input.artistId ? { artistId: input.artistId } : {}),
      ...(input.style ? { style: input.style } : {}),
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    lyrics?: unknown;
    remaining?: unknown;
    reason?: unknown;
    error?: unknown;
  };
  const remaining = typeof data.remaining === 'number' ? data.remaining : 0;
  if (response.status === 429) {
    return {
      lyrics: '',
      remaining: 0,
      reason: data.reason === 'day' ? 'day' : 'session',
      error: typeof data.error === 'string' ? data.error : 'No drafts left.',
    };
  }
  if (!response.ok || typeof data.lyrics !== 'string') {
    return {
      lyrics: '',
      remaining,
      error: typeof data.error === 'string' ? data.error : "Couldn't write a draft.",
    };
  }
  return { lyrics: data.lyrics, remaining };
}
