import { X_API_BASE } from './config';

export class XApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: string,
    public kind: XFailKind
  ) {
    super(message);
  }
}

export type XFailKind = 'auth' | 'spam' | 'rate_limit' | 'other';

export function classifyXError(status: number, body: string): XFailKind {
  const lower = body.toLowerCase();
  if (status === 401) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status === 403) {
    if (/unauthorized|oauth|token|expired|invalid/.test(lower)) return 'auth';
    return 'spam';
  }
  return 'other';
}

export function shouldPauseOnFail(kind: XFailKind): boolean {
  return kind === 'auth' || kind === 'spam' || kind === 'rate_limit';
}

export function pauseMessage(kind: XFailKind, detail: string): string {
  if (kind === 'auth') {
    return `X authentication failed. Posting paused. Reconnect this artist’s X account. ${detail}`.trim();
  }
  if (kind === 'spam') {
    return `X rejected the post (spam/permissions). Posting paused. ${detail}`.trim();
  }
  if (kind === 'rate_limit') {
    return `X rate-limited this account. Posting paused. Resume later. ${detail}`.trim();
  }
  return detail;
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const json = JSON.parse(text) as {
      detail?: string;
      title?: string;
      error_description?: string;
      error?: string;
      errors?: Array<{ message?: string }>;
    };
    return (
      json.detail ||
      json.error_description ||
      json.title ||
      json.error ||
      json.errors?.[0]?.message ||
      text ||
      `HTTP ${res.status}`
    );
  } catch {
    return text || `HTTP ${res.status}`;
  }
}

async function xFetch(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${X_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  });
}

export interface XUserMe {
  id: string;
  name: string;
  username: string;
}

export async function getXUserMe(accessToken: string): Promise<XUserMe> {
  const res = await xFetch(
    accessToken,
    '/users/me?user.fields=id,name,username,description,profile_image_url'
  );
  if (!res.ok) {
    const body = await readError(res);
    throw new XApiError(res.status, body, body, classifyXError(res.status, body));
  }
  const json = (await res.json()) as { data?: XUserMe };
  if (!json.data?.id || !json.data.username) {
    throw new XApiError(500, 'X /users/me returned no user', '', 'other');
  }
  return json.data;
}

export async function createTweet(
  accessToken: string,
  input: { text: string; mediaId?: string | null }
): Promise<{ tweetId: string }> {
  const payload: {
    text: string;
    media?: { media_ids: string[] };
  } = { text: input.text };
  if (input.mediaId) {
    payload.media = { media_ids: [input.mediaId] };
  }

  const res = await xFetch(accessToken, '/tweets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new XApiError(
      res.status,
      raw || `Tweet failed (${res.status})`,
      raw,
      classifyXError(res.status, raw)
    );
  }
  const json = JSON.parse(raw) as { data?: { id?: string } };
  const tweetId = json.data?.id;
  if (!tweetId) {
    throw new XApiError(500, 'X tweet response missing id', raw, 'other');
  }
  return { tweetId };
}

/**
 * v2 chunked media upload (INIT / APPEND / FINALIZE).
 * Returns a media id, or null if upload is not possible (missing scope, etc.).
 * Callers should tweet without media rather than fail the whole post.
 */
export async function uploadTweetImage(
  accessToken: string,
  bytes: Buffer,
  mimeType: string
): Promise<string | null> {
  try {
    const initForm = new FormData();
    initForm.append('command', 'INIT');
    initForm.append('media_type', mimeType);
    initForm.append('total_bytes', String(bytes.length));
    initForm.append('media_category', 'tweet_image');

    const initRes = await fetch('https://api.x.com/2/media/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: initForm,
    });
    const initJson = (await initRes.json().catch(() => ({}))) as {
      data?: { id?: string; media_key?: string };
      media_id_string?: string;
      media_id?: string | number;
    };
    const mediaId =
      initJson.data?.id ||
      initJson.media_id_string ||
      (initJson.media_id != null ? String(initJson.media_id) : null);
    if (!initRes.ok || !mediaId) {
      console.warn('[X] media INIT failed', initRes.status, initJson);
      return null;
    }

    const appendForm = new FormData();
    appendForm.append('command', 'APPEND');
    appendForm.append('media_id', mediaId);
    appendForm.append('segment_index', '0');
    appendForm.append(
      'media',
      new Blob([new Uint8Array(bytes)], { type: mimeType }),
      'cover.jpg'
    );

    const appendRes = await fetch('https://api.x.com/2/media/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: appendForm,
    });
    if (!appendRes.ok) {
      console.warn('[X] media APPEND failed', appendRes.status, await appendRes.text());
      return null;
    }

    const finalizeForm = new FormData();
    finalizeForm.append('command', 'FINALIZE');
    finalizeForm.append('media_id', mediaId);
    const finalizeRes = await fetch('https://api.x.com/2/media/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: finalizeForm,
    });
    if (!finalizeRes.ok) {
      console.warn(
        '[X] media FINALIZE failed',
        finalizeRes.status,
        await finalizeRes.text()
      );
      return null;
    }

    return mediaId;
  } catch (error) {
    console.warn('[X] media upload error', error);
    return null;
  }
}

/**
 * Best-effort profile sync. X has no stable v2 profile-write endpoint;
 * try users.write-shaped requests, then v1.1. Failures are non-fatal.
 */
export async function syncXProfile(input: {
  accessToken: string;
  name: string;
  bio: string;
  avatarBytes?: Buffer | null;
  avatarMime?: string | null;
}): Promise<{ ok: boolean; detail: string | null }> {
  const notes: string[] = [];

  const patchRes = await fetch('https://api.x.com/2/users/me', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: input.name, description: input.bio }),
  }).catch(() => null);

  if (patchRes?.ok) {
    notes.push('name/bio via PATCH /2/users/me');
  } else {
    const v11 = new URLSearchParams({
      name: input.name,
      description: input.bio,
    });
    const v11Res = await fetch(
      `https://api.x.com/1.1/account/update_profile.json?${v11.toString()}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${input.accessToken}` },
      }
    ).catch(() => null);
    if (v11Res?.ok) {
      notes.push('name/bio via v1.1 update_profile');
    } else {
      notes.push(
        'name/bio sync unavailable (X has no supported OAuth 2.0 profile-write endpoint for this app)'
      );
    }
  }

  if (input.avatarBytes && input.avatarBytes.length > 0) {
    const imageB64 = input.avatarBytes.toString('base64');
    const imgRes = await fetch(
      'https://api.x.com/1.1/account/update_profile_image.json',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ image: imageB64 }).toString(),
      }
    ).catch(() => null);
    if (imgRes?.ok) {
      notes.push('avatar via v1.1 update_profile_image');
    } else {
      notes.push('avatar sync unavailable on OAuth 2.0 user tokens');
    }
  }

  const failedAll = notes.every(n => n.includes('unavailable'));
  return {
    ok: !failedAll,
    detail: notes.join('; '),
  };
}
