import { webPlatformHeaders } from '@/lib/funnel/platform';
import type { Energy, FeelLabel, VoiceChoice } from '@/lib/create/songOptions';

async function postJson(
  path: string,
  token: string,
  body: Record<string, unknown>
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
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
  return { ok: true, data: data as Record<string, unknown> };
}

export function postBeatFirst(input: {
  token: string;
  artistId: string;
  title: string;
  prompt: string;
  feel: FeelLabel[];
  energy: Energy;
  idempotencyKey: string;
}) {
  return postJson('/api/songs/beat-first', input.token, {
    artistId: input.artistId,
    title: input.title,
    prompt: input.prompt,
    feel: input.feel,
    energy: input.energy,
    idempotencyKey: input.idempotencyKey,
  });
}

export function postBeatRetry(input: {
  token: string;
  songId: string;
  feel: FeelLabel[];
  energy: Energy;
}) {
  return postJson(`/api/songs/${encodeURIComponent(input.songId)}/beat`, input.token, {
    feel: input.feel,
    energy: input.energy,
  });
}

export function postBeatVocals(input: {
  token: string;
  songId: string;
  versionId: string;
  voice: VoiceChoice;
  words: 'artist' | 'mine';
  lyrics: string;
  sessionId: string;
}) {
  return postJson(`/api/songs/${encodeURIComponent(input.songId)}/beat/vocals`, input.token, {
    versionId: input.versionId,
    voice: input.voice,
    words: input.words,
    lyrics: input.lyrics,
    sessionId: input.sessionId,
  });
}

export function postBeatKeep(input: { token: string; songId: string; versionId: string }) {
  return postJson(`/api/songs/${encodeURIComponent(input.songId)}/beat/keep`, input.token, {
    versionId: input.versionId,
  });
}
