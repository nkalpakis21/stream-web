import { webPlatformHeaders } from '@/lib/funnel/platform';
import { SWITCH_TAKE_ERROR, type TakeNumber } from '@/lib/songs/takes';

export async function postSongTake(input: {
  songId: string;
  versionId: string;
  msToPick: number;
  token: string;
}): Promise<{ ok: true; take: TakeNumber } | { ok: false; error: string }> {
  const response = await fetch(`/api/songs/${encodeURIComponent(input.songId)}/take`, {
    method: 'POST',
    headers: webPlatformHeaders({
      Authorization: `Bearer ${input.token}`,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      versionId: input.versionId,
      msToPick: input.msToPick,
    }),
  });
  const data = (await response.json().catch(() => null)) as { error?: unknown; take?: unknown } | null;
  if (!response.ok) {
    const error = data && typeof data.error === 'string' ? data.error : SWITCH_TAKE_ERROR;
    return { ok: false, error };
  }
  return { ok: true, take: data?.take === 2 ? 2 : 1 };
}
