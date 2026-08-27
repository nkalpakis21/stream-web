import { getAdminDb, isFirebaseAdminConfigured } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { emptyXConnection, type SongDocument, type SongVersionDocument } from '@/types/firestore';
import { composeSongLivePost } from './compose';
import { getPublicAppUrl, isXConfigured } from './config';
import {
  createTweet,
  pauseMessage,
  shouldPauseOnFail,
  uploadTweetImage,
  XApiError,
} from './client';
import {
  firestoreNow,
  getArtistAdmin,
  getSongAdmin,
  pauseArtistX,
  prependArtistXPost,
} from './artistStore';
import { loadXAuth, saveXAuth } from './tokens';
import { refreshAccessToken } from './oauth';

const ACCESS_SKEW_MS = 60_000;

async function getValidAccessToken(artistId: string): Promise<string> {
  const stored = await loadXAuth(artistId);
  if (!stored?.refreshToken && !stored?.accessToken) {
    throw new Error('Artist has no X tokens');
  }
  if (
    stored.accessToken &&
    stored.accessTokenExpiresAt &&
    Date.now() < stored.accessTokenExpiresAt - ACCESS_SKEW_MS
  ) {
    return stored.accessToken;
  }
  if (!stored.refreshToken) {
    throw new XApiError(401, 'X refresh token missing', '', 'auth');
  }
  const refreshed = await refreshAccessToken(stored.refreshToken);
  await saveXAuth({
    artistId,
    ownerId: stored.ownerId,
    tokens: refreshed,
  });
  return refreshed.accessToken;
}

async function songHasAudio(song: SongDocument): Promise<boolean> {
  const db = getAdminDb();
  const snap = await db
    .collection(COLLECTIONS.songVersions)
    .where('songId', '==', song.id)
    .limit(20)
    .get();
  return snap.docs.some(doc => {
    const version = doc.data() as SongVersionDocument;
    return Boolean(version.audioURL);
  });
}

async function fetchCoverBytes(
  url: string | null | undefined
): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!url || !url.startsWith('http')) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mime = res.headers.get('content-type') || 'image/jpeg';
    if (!mime.startsWith('image/')) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength === 0 || ab.byteLength > 5_000_000) return null;
    return { bytes: Buffer.from(ab), mime };
  } catch {
    return null;
  }
}

export type SongLivePostResult =
  | { ok: true; tweetId: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; paused: true; reason: string }
  | { ok: false; reason: string };

/**
 * Post once when a public song goes live. Idempotent.
 * Never fakes a post. On auth/spam/rate-limit, pauses the artist and stops.
 */
export async function maybePostSongLive(songId: string): Promise<SongLivePostResult> {
  try {
    if (!isXConfigured()) {
      return { ok: false, skipped: true, reason: 'X is not configured' };
    }
    if (!isFirebaseAdminConfigured()) {
      return {
        ok: false,
        skipped: true,
        reason: 'Firebase Admin is not configured; cannot read X tokens',
      };
    }

    const song = await getSongAdmin(songId);
    if (!song || song.deletedAt) {
      return { ok: false, skipped: true, reason: 'Song not found' };
    }
    if (!song.isPublic) {
      return { ok: false, skipped: true, reason: 'Song is not public' };
    }
    if (!(await songHasAudio(song))) {
      return { ok: false, skipped: true, reason: 'Song has no audio yet' };
    }

    const artist = await getArtistAdmin(song.artistId);
    if (!artist || artist.deletedAt) {
      return { ok: false, skipped: true, reason: 'Artist not found' };
    }
    const x = artist.x ?? emptyXConnection();
    if (x.status === 'disconnected') {
      return { ok: false, skipped: true, reason: 'X is not connected' };
    }
    if (x.status === 'paused') {
      return { ok: false, skipped: true, reason: 'X posting is paused' };
    }

    const db = getAdminDb();
    const claimRef = db.collection(COLLECTIONS.xSongPosts).doc(song.id);
    try {
      await claimRef.create({
        songId: song.id,
        artistId: artist.id,
        status: 'pending',
        createdAtMs: Date.now(),
      });
    } catch (err: unknown) {
      const code = (err as { code?: number | string })?.code;
      // Already claimed (ALREADY_EXISTS = 6)
      if (code === 6 || code === 'already-exists') {
        return { ok: false, skipped: true, reason: 'Already posted or claimed' };
      }
      throw err;
    }

    const text = composeSongLivePost({
      artistName: artist.name,
      lore: artist.lore,
      styleDNA: artist.styleDNA,
      songTitle: song.title,
      songUrl: `${getPublicAppUrl()}/songs/${song.id}`,
      recentPostTexts: x.recentPostTexts || [],
      songId: song.id,
    });

    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(artist.id);
    } catch (err) {
      await claimRef.delete().catch(() => undefined);
      const message = err instanceof Error ? err.message : 'X token refresh failed';
      await pauseArtistX(artist.id, pauseMessage('auth', message));
      return { ok: false, paused: true, reason: message };
    }

    const coverUrl = song.albumCoverPath || song.albumCoverThumbnail;
    const cover = await fetchCoverBytes(coverUrl);
    let mediaId: string | null = null;
    if (cover) {
      mediaId = await uploadTweetImage(accessToken, cover.bytes, cover.mime);
    }

    try {
      const { tweetId } = await createTweet(accessToken, { text, mediaId });
      const url = x.username
        ? `https://x.com/${x.username}/status/${tweetId}`
        : `https://x.com/i/web/status/${tweetId}`;

      await prependArtistXPost(
        artist.id,
        {
          tweetId,
          url,
          songId: song.id,
          songTitle: song.title,
          text,
          createdAt: firestoreNow(),
        },
        text
      );

      await claimRef.set(
        {
          status: 'posted',
          tweetId,
          url,
          postedAtMs: Date.now(),
        },
        { merge: true }
      );

      return { ok: true, tweetId };
    } catch (err) {
      if (err instanceof XApiError && shouldPauseOnFail(err.kind)) {
        const reason = pauseMessage(err.kind, err.message);
        await pauseArtistX(artist.id, reason);
        await claimRef.set(
          { status: 'failed', reason, failedAtMs: Date.now() },
          { merge: true }
        );
        return { ok: false, paused: true, reason };
      }
      // Transient: drop the claim so a webhook retry can try once more.
      await claimRef.delete().catch(() => undefined);
      const reason = err instanceof Error ? err.message : 'Tweet failed';
      console.error('[X] song-live post failed', song.id, reason);
      return { ok: false, reason };
    }
  } catch (error) {
    console.error('[X] maybePostSongLive', error);
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
