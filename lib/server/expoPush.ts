/**
 * Best-effort Expo push when a song's first audio is stored.
 * A failure here must not fail or delay the MusicGPT webhook.
 *
 * data is exactly { type: "song_ready", songId, artistId }. The mobile app
 * opens the artist page from artistId.
 */

import { createHash } from 'crypto';
import { waitUntil } from '@vercel/functions';
import { FieldValue } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAdminDb } from '@/lib/firebase/admin';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const EXPO_TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,160}\]$/;

export type SongReadyData = {
  type: 'song_ready';
  songId: string;
  artistId: string;
};

export const SONG_READY_BODY = 'Tap to play';

export type SongReadyMessage = {
  to: string;
  title: string;
  body: string;
  data: SongReadyData;
};

type TokenLister = (uid: string) => Promise<string[]>;
type PushSender = (messages: SongReadyMessage[]) => Promise<unknown>;
type TokenDeleter = (uid: string, token: string) => Promise<void>;

let tokensForTests: TokenLister | null = null;
let senderForTests: PushSender | null = null;
let deleteForTests: TokenDeleter | null = null;

export function setSongReadyPushForTests(
  hooks: {
    tokens?: TokenLister | null;
    send?: PushSender | null;
    deleteToken?: TokenDeleter | null;
  } | null
): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setSongReadyPushForTests is disabled in production');
  }
  tokensForTests = hooks?.tokens ?? null;
  senderForTests = hooks?.send ?? null;
  deleteForTests = hooks?.deleteToken ?? null;
}

export function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string' && EXPO_TOKEN.test(value);
}

/** Stable doc id so registering the same token twice updates one document. */
export function pushTokenDocId(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function songReadyMessageText(title: string): string {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${clean || 'Your song'} is ready`;
}

export function songReadyPushMessages(
  tokens: readonly string[],
  input: { title: string; songId: string; artistId: string }
): SongReadyMessage[] {
  const title = songReadyMessageText(input.title);
  const data: SongReadyData = {
    type: 'song_ready',
    songId: input.songId,
    artistId: input.artistId,
  };
  return tokens.filter(isExpoPushToken).map(token => ({
    to: token,
    title,
    body: SONG_READY_BODY,
    data,
  }));
}

/**
 * Tickets come back in the same order as the messages we sent.
 * Only DeviceNotRegistered is stale. Other errors stay stored.
 */
export function expoUnregisteredTokens(
  messages: readonly { to: string }[],
  body: unknown
): string[] {
  if (!body || typeof body !== 'object' || !('data' in body)) return [];
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const dropped: string[] = [];
  data.forEach((ticket, index) => {
    if (!ticket || typeof ticket !== 'object') return;
    const record = ticket as { status?: unknown; details?: { error?: unknown } };
    if (record.status !== 'error' || record.details?.error !== 'DeviceNotRegistered') return;
    const token = messages[index]?.to;
    if (token) dropped.push(token);
  });
  return dropped;
}

async function listOwnerTokens(uid: string): Promise<string[]> {
  if (process.env.NODE_ENV !== 'production' && tokensForTests) {
    return tokensForTests(uid);
  }
  if (process.env.NODE_TEST_CONTEXT) return [];
  const snap = await getAdminDb()
    .collection(COLLECTIONS.users)
    .doc(uid)
    .collection('pushTokens')
    .get();
  const tokens: string[] = [];
  for (const doc of snap.docs) {
    const token = doc.get('token');
    const platform = doc.get('platform');
    if (platform === 'ios' && isExpoPushToken(token)) tokens.push(token);
  }
  return tokens;
}

async function postExpo(messages: SongReadyMessage[]): Promise<unknown> {
  if (process.env.NODE_ENV !== 'production' && senderForTests) {
    return senderForTests(messages);
  }
  if (process.env.NODE_TEST_CONTEXT) return null;
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    console.error('[push] expo status', response.status);
    return null;
  }
  return response.json().catch(() => null);
}

async function deleteOwnerToken(uid: string, token: string): Promise<void> {
  if (process.env.NODE_ENV !== 'production' && deleteForTests) {
    await deleteForTests(uid, token);
    return;
  }
  if (process.env.NODE_TEST_CONTEXT) return;
  await getAdminDb()
    .collection(COLLECTIONS.users)
    .doc(uid)
    .collection('pushTokens')
    .doc(pushTokenDocId(token))
    .delete();
}

async function sendSongReady(input: {
  ownerId: string;
  title: string;
  songId: string;
  artistId: string;
}): Promise<void> {
  if (!input.ownerId || !input.songId || !input.artistId) return;
  const tokens = await listOwnerTokens(input.ownerId);
  const messages = songReadyPushMessages(tokens, input);
  if (messages.length === 0) return;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const body = await postExpo(chunk);
    for (const token of expoUnregisteredTokens(chunk, body)) {
      try {
        await deleteOwnerToken(input.ownerId, token);
      } catch (error) {
        console.error('[push] drop token', error instanceof Error ? error.message : 'failed');
      }
    }
  }
}

function keepAlive(task: Promise<unknown>): void {
  try {
    waitUntil(task);
  } catch {
    // Outside a Vercel request the promise still runs on its own.
  }
}

/**
 * Fire-and-forget. Never throws. Does not block the webhook response.
 */
export function notifyOwnerSongReady(input: {
  ownerId: string;
  title: string;
  songId: string;
  artistId: string;
}): void {
  const task = sendSongReady(input).catch(error => {
    console.error('[push] song_ready', error instanceof Error ? error.message : 'failed');
  });
  keepAlive(task);
}

export async function saveOwnerPushToken(uid: string, token: string): Promise<void> {
  const id = pushTokenDocId(token);
  await getAdminDb()
    .collection(COLLECTIONS.users)
    .doc(uid)
    .collection('pushTokens')
    .doc(id)
    .set(
      {
        token,
        platform: 'ios',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}
