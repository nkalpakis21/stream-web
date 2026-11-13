import { webPlatformHeaders } from '@/lib/funnel/platform';

async function postJson(
  path: string,
  token: string,
  body: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(path, {
    method: 'POST',
    headers: webPlatformHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }),
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) return { ok: false, error: data.error || 'Request failed' };
  return { ok: true };
}

export function postVoiceChange(input: { token: string; songId: string; voice: string }) {
  return postJson(`/api/songs/${input.songId}/voice`, input.token, { voice: input.voice });
}

export function postKeepVoice(input: { token: string; songId: string; versionId: string | null }) {
  return postJson(`/api/songs/${input.songId}/voice/keep`, input.token, {
    versionId: input.versionId ?? 'original',
  });
}
