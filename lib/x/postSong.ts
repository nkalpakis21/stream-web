import { getAdminDb, isFirebaseAdminConfigured } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { recordFunnelEvent } from '@/lib/server/funnel';
import {
  emptyXConnection,
  type SongDocument,
  type SongVersionDocument,
  type XConnectionPublic,
  type XPostReservation,
} from '@/types/firestore';
import { timestampMillis } from './autoPost';
import { decideXCover, readSongModeration, xPostBlocked } from './blocklist';
import { capPostTimes, X_POST_WINDOW_MS } from './caps';
import { composeSongLivePost, rawLoreLine } from './compose';
import { isXConfigured, songSharePageUrl } from './config';
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
  persistGrandfatherAutoPost,
  prependArtistXPost,
  refreshArtistDeferred,
  reservationsWith,
  reservationsWithout,
} from './artistStore';
import { loadXAuth, saveXAuth } from './tokens';
import { refreshAccessToken } from './oauth';
import { resolveCoverPoster } from '@/lib/covers/resolve';
import { AUTO_POST_OFF_REASON, planSongLivePost, type SongLivePlan } from './planPost';
import { songAudioReadyAtMs } from './readyAt';

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

async function loadReadyAt(song: SongDocument): Promise<number | null> {
  const db = getAdminDb();
  const snap = await db
    .collection(COLLECTIONS.songVersions)
    .where('songId', '==', song.id)
    .limit(20)
    .get();
  const versions = snap.docs.map(doc => {
    const version = doc.data() as SongVersionDocument;
    const audioURL = typeof version.audioURL === 'string' ? version.audioURL.trim() : '';
    return {
      hasAudio: audioURL.length > 0,
      createdAtMs: timestampMillis(version.createdAt),
    };
  });
  if (!versions.some(version => version.hasAudio)) return null;
  return songAudioReadyAtMs(versions, [
    timestampMillis(song.updatedAt),
    timestampMillis(song.createdAt),
  ]);
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

async function songHasOpenReport(songId: string): Promise<boolean> {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.reports)
    .where('targetId', '==', songId)
    .limit(20)
    .get();
  return snap.docs.some(doc => {
    const data = doc.data();
    if (data.targetType !== 'song') return false;
    return data.status == null || data.status === 'open';
  });
}

function clipTitle(title: string): string {
  const trimmed = title.replace(/\s+/g, ' ').trim();
  if (!trimmed) return 'Song';
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 79).trim()}…`;
}

function postedRows(x: XConnectionPublic): Array<{ songId: string; atMs: number | null }> {
  return (x.posts || []).map(post => ({
    songId: post.songId,
    atMs: timestampMillis(post.createdAt),
  }));
}

export type SongLivePostResult =
  | { ok: true; tweetId: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; paused: true; reason: string }
  | { ok: false; reason: string };

type ClaimOutcome =
  | { type: 'skip'; reason: string }
  | { type: 'defer'; notBeforeMs: number }
  | { type: 'done'; reason: string }
  | { type: 'post' };

/**
 * Post once when a public song goes live. Idempotent.
 * Never fakes a post. On auth/spam/rate-limit, pauses the artist and stops.
 * The link is the share page (`/songs/{id}`), whose twitter card is the share card.
 * Covers are omitted unless an image-moderation pass is stored on the song.
 */
export async function maybePostSongLive(songId: string): Promise<SongLivePostResult> {
  try {
    if (!isXConfigured()) {
      console.log('[X] maybePostSongLive skipped', songId, 'X is not configured');
      return { ok: false, skipped: true, reason: 'X is not configured' };
    }
    if (!isFirebaseAdminConfigured()) {
      console.log(
        '[X] maybePostSongLive skipped',
        songId,
        'Firebase Admin is not configured'
      );
      return {
        ok: false,
        skipped: true,
        reason: 'Firebase Admin is not configured; cannot read X tokens',
      };
    }

    const song = await getSongAdmin(songId);
    if (!song || song.deletedAt) {
      console.log('[X] maybePostSongLive skipped', songId, 'Song not found');
      return { ok: false, skipped: true, reason: 'Song not found' };
    }
    if (!song.isPublic) {
      console.log('[X] maybePostSongLive skipped', songId, 'Song is not public');
      return { ok: false, skipped: true, reason: 'Song is not public' };
    }

    const readyAtMs = await loadReadyAt(song);
    if (readyAtMs == null) {
      console.log('[X] maybePostSongLive skipped', songId, 'Song has no audio yet');
      return { ok: false, skipped: true, reason: 'Song has no audio yet' };
    }

    const artist = await getArtistAdmin(song.artistId);
    if (!artist || artist.deletedAt) {
      console.log('[X] maybePostSongLive skipped', songId, 'Artist not found');
      return { ok: false, skipped: true, reason: 'Artist not found' };
    }
    const x = artist.x ?? emptyXConnection();
    if (x.status === 'disconnected') {
      console.log(
        '[X] maybePostSongLive skipped',
        songId,
        'X is not connected for artist',
        artist.id
      );
      return { ok: false, skipped: true, reason: 'X is not connected' };
    }
    if (x.status === 'paused') {
      console.log(
        '[X] maybePostSongLive skipped',
        songId,
        'X posting is paused',
        x.lastError
      );
      return { ok: false, skipped: true, reason: 'X posting is paused' };
    }

    const nowMs = Date.now();
    const stamped = await persistGrandfatherAutoPost(artist.id, nowMs);
    if (!stamped.autoPost) {
      console.log('[X] maybePostSongLive skipped', songId, AUTO_POST_OFF_REASON);
      return { ok: false, skipped: true, reason: AUTO_POST_OFF_REASON };
    }

    const title = clipTitle(song.title);
    const loreLine = rawLoreLine(artist.lore || '');
    const text = composeSongLivePost({
      artistName: artist.name,
      lore: artist.lore,
      styleDNA: artist.styleDNA,
      songTitle: song.title,
      songUrl: songSharePageUrl(song.id),
      recentPostTexts: x.recentPostTexts || [],
      songId: song.id,
    });
    const moderation = readSongModeration(song);
    const openReports = await songHasOpenReport(song.id);
    const cover = decideXCover({
      openReports,
      moderationFlagged: moderation.moderationFlagged,
      imageModeration: moderation.imageModeration,
    });
    const blocked =
      cover === 'block' || xPostBlocked(song.title, artist.name, loreLine, text);

    const db = getAdminDb();
    const claimRef = db.collection(COLLECTIONS.xSongPosts).doc(song.id);
    const artistRef = db.collection(COLLECTIONS.artists).doc(artist.id);

    const outcome = await db.runTransaction(async (tx): Promise<ClaimOutcome> => {
      const claimSnap = await tx.get(claimRef);
      const artistSnap = await tx.get(artistRef);
      const existing = claimSnap.exists ? String(claimSnap.get('status') || '') : null;
      const current =
        (artistSnap.data() as { x?: XConnectionPublic } | undefined)?.x ?? emptyXConnection();
      const plan: SongLivePlan = planSongLivePost({
        nowMs,
        autoPost: stamped.autoPost,
        enabledAtMs: stamped.enabledAtMs,
        songReadyAtMs: readyAtMs,
        postedAtMs: capPostTimes({
          nowMs,
          songId: song.id,
          posted: postedRows(current),
          reservations: current.reservations,
        }),
        blocked,
        existingStatus: existing,
      });

      if (plan.type === 'skip') return { type: 'skip', reason: plan.reason };

      const base = {
        songId: song.id,
        artistId: artist.id,
        title,
        readyAtMs,
        createdAtMs:
          typeof claimSnap.get('createdAtMs') === 'number'
            ? claimSnap.get('createdAtMs')
            : nowMs,
        updatedAtMs: nowMs,
      };

      if (plan.type === 'post') {
        tx.set(claimRef, { ...base, status: 'pending' });
        tx.update(artistRef, {
          'x.reservations': reservationsWith(current.reservations, song.id, nowMs),
        });
        return { type: 'post' };
      }

      if (plan.type === 'defer') {
        tx.set(claimRef, {
          ...base,
          status: 'deferred',
          notBeforeMs: plan.notBeforeMs,
          reason: 'deferred',
        });
        tx.update(artistRef, {
          'x.reservations': reservationsWithout(current.reservations, song.id),
        });
        return { type: 'defer', notBeforeMs: plan.notBeforeMs };
      }

      tx.set(claimRef, {
        ...base,
        status: plan.status,
        reason: plan.reason,
        ...(plan.status === 'skipped_stale' ? { skippedAtMs: nowMs } : {}),
      });
      const patch: Record<string, unknown> = {
        'x.reservations': reservationsWithout(current.reservations, song.id),
      };
      if (plan.status === 'skipped_stale') {
        patch['x.lastSkippedTitle'] = title;
        patch['x.lastSkippedAtMs'] = nowMs;
      }
      tx.update(artistRef, patch);
      return { type: 'done', reason: plan.reason };
    });

    if (outcome.type === 'skip') {
      console.log('[X] maybePostSongLive skipped', song.id, outcome.reason);
      return { ok: false, skipped: true, reason: outcome.reason };
    }
    if (outcome.type === 'defer') {
      await refreshArtistDeferred(artist.id);
      console.log('[X] maybePostSongLive deferred', song.id, outcome.notBeforeMs);
      return { ok: false, skipped: true, reason: 'deferred' };
    }
    if (outcome.type === 'done') {
      await refreshArtistDeferred(artist.id);
      console.log('[X] maybePostSongLive skipped', song.id, outcome.reason);
      return { ok: false, skipped: true, reason: outcome.reason };
    }

    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(artist.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'X token refresh failed';
      await releaseClaim(song.id, artist.id, readyAtMs, title, nowMs, 'auth');
      await pauseArtistX(artist.id, pauseMessage('auth', message));
      return { ok: false, paused: true, reason: message };
    }

    let mediaId: string | null = null;
    if (cover === 'attach') {
      const coverUrl = resolveCoverPoster(song);
      const bytes = await fetchCoverBytes(coverUrl);
      if (bytes) {
        mediaId = await uploadTweetImage(accessToken, bytes.bytes, bytes.mime);
      }
    }

    let tweetId: string;
    try {
      const created = await createTweet(accessToken, { text, mediaId });
      tweetId = created.tweetId;
    } catch (err) {
      if (err instanceof XApiError && shouldPauseOnFail(err.kind)) {
        const reason = pauseMessage(err.kind, err.message);
        await pauseArtistX(artist.id, reason);
        if (err.kind === 'auth') {
          await releaseClaim(song.id, artist.id, readyAtMs, title, nowMs, 'auth');
        } else {
          await claimRef.set(
            {
              status: 'failed',
              reason,
              failedAtMs: Date.now(),
              updatedAtMs: Date.now(),
            },
            { merge: true }
          );
          await clearReservation(artist.id, song.id);
          await refreshArtistDeferred(artist.id);
        }
        return { ok: false, paused: true, reason };
      }
      await releaseClaim(song.id, artist.id, readyAtMs, title, nowMs, 'transient');
      const reason = err instanceof Error ? err.message : 'Tweet failed';
      console.error('[X] song-live post failed', song.id, reason);
      return { ok: false, reason };
    }

    const url = x.username
      ? `https://x.com/${x.username}/status/${tweetId}`
      : `https://x.com/i/web/status/${tweetId}`;
    const postedAtMs = Date.now();
    await claimRef.set(
      {
        status: 'posted',
        tweetId,
        url,
        postedAtMs,
        updatedAtMs: postedAtMs,
      },
      { merge: true }
    );
    try {
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
      await refreshArtistDeferred(artist.id);
    } catch (error) {
      console.error('[X] posted but activity log failed', song.id, error);
    }
    recordFunnelEvent(
      song.ownerId,
      'x_post',
      { songId: song.id, artistId: artist.id },
      'unknown'
    );
    return { ok: true, tweetId };
  } catch (error) {
    console.error('[X] maybePostSongLive', error);
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function clearReservation(artistId: string, songId: string): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.artists).doc(artistId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const current = (snap.data() as { x?: XConnectionPublic } | undefined)?.x;
    if (!current) return;
    tx.update(ref, {
      'x.reservations': reservationsWithout(current.reservations, songId),
    });
  });
}

/**
 * Auth and transient failures put the song back to deferred so a later sweep
 * can post it inside the 24h window. Past that window it is skipped_stale.
 */
async function releaseClaim(
  songId: string,
  artistId: string,
  readyAtMs: number,
  title: string,
  nowMs: number,
  kind: 'auth' | 'transient'
): Promise<void> {
  const db = getAdminDb();
  const claimRef = db.collection(COLLECTIONS.xSongPosts).doc(songId);
  const artistRef = db.collection(COLLECTIONS.artists).doc(artistId);
  const stale = nowMs > readyAtMs + X_POST_WINDOW_MS;
  await db.runTransaction(async tx => {
    const artistSnap = await tx.get(artistRef);
    const current = (artistSnap.data() as { x?: XConnectionPublic } | undefined)?.x;
    const reservations: XPostReservation[] = reservationsWithout(
      current?.reservations,
      songId
    );
    if (stale) {
      tx.set(
        claimRef,
        {
          songId,
          artistId,
          title,
          readyAtMs,
          status: 'skipped_stale',
          reason: 'skipped_stale',
          skippedAtMs: nowMs,
          updatedAtMs: nowMs,
        },
        { merge: true }
      );
      tx.update(artistRef, {
        'x.reservations': reservations,
        'x.lastSkippedTitle': title,
        'x.lastSkippedAtMs': nowMs,
      });
      return;
    }
    tx.set(
      claimRef,
      {
        songId,
        artistId,
        title,
        readyAtMs,
        status: 'deferred',
        notBeforeMs: nowMs,
        reason: kind === 'auth' ? 'auth' : 'deferred',
        updatedAtMs: nowMs,
      },
      { merge: true }
    );
    tx.update(artistRef, { 'x.reservations': reservations });
  });
  await refreshArtistDeferred(artistId);
}

/**
 * Post deferred songs whose window has opened, and drop ones that missed 24h.
 * One song at a time. Safe to call from the cron.
 */
export async function sweepDeferredXPosts(limit = 40): Promise<{
  ok: true;
  examined: number;
  posted: number;
  deferred: number;
  skipped: number;
  errors: number;
}> {
  if (!isXConfigured() || !isFirebaseAdminConfigured()) {
    return { ok: true, examined: 0, posted: 0, deferred: 0, skipped: 0, errors: 0 };
  }
  const snap = await getAdminDb()
    .collection(COLLECTIONS.xSongPosts)
    .where('status', '==', 'deferred')
    .limit(limit)
    .get();
  const now = Date.now();
  const rows = snap.docs
    .map(doc => ({ id: doc.id, data: doc.data() }))
    .sort((a, b) => Number(a.data.notBeforeMs ?? 0) - Number(b.data.notBeforeMs ?? 0));

  let posted = 0;
  let deferred = 0;
  let skipped = 0;
  let errors = 0;
  let examined = 0;
  for (const row of rows) {
    const readyAtMs = Number(row.data.readyAtMs ?? 0);
    const notBeforeMs = Number(row.data.notBeforeMs ?? 0);
    const stale =
      Number.isFinite(readyAtMs) && readyAtMs > 0 && now > readyAtMs + X_POST_WINDOW_MS;
    if (!stale && notBeforeMs > now) continue;
    examined += 1;
    try {
      const result = await maybePostSongLive(row.id);
      if (result.ok) posted += 1;
      else if ('skipped' in result && result.skipped && result.reason === 'deferred') deferred += 1;
      else if ('skipped' in result && result.skipped) skipped += 1;
      else errors += 1;
    } catch (error) {
      errors += 1;
      console.error('[X] sweep deferred', row.id, error);
    }
  }
  return { ok: true, examined, posted, deferred, skipped, errors };
}
