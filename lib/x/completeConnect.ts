import type { FunnelPlatform } from '@/lib/funnel/platform';
import { recordFunnelEvent } from '@/lib/server/funnel';
import { composeProfileBio, composeProfileName } from './compose';
import { getXUserMe, syncXProfile } from './client';
import { resolveAutoPost } from './autoPost';
import { firestoreNow, getArtistAdmin, updateArtistX } from './artistStore';
import { isProfileSyncUnavailableError } from './profileSyncUnavailable';
import { deleteXAuth, saveXAuth } from './tokens';
import type { XTokenSet } from './oauth';

async function fetchAvatarBytes(
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

/**
 * After OAuth succeeds: persist tokens, record the X user, sync name/bio/avatar once.
 */
export async function completeXConnect(input: {
  artistId: string;
  ownerId: string;
  tokens: XTokenSet;
  platform?: FunnelPlatform;
}): Promise<{ username: string; profileSyncDetail: string | null }> {
  const artist = await getArtistAdmin(input.artistId);
  if (!artist) {
    throw new Error('Artist not found');
  }

  await saveXAuth({
    artistId: input.artistId,
    ownerId: input.ownerId,
    tokens: input.tokens,
  });

  let me;
  try {
    me = await getXUserMe(input.tokens.accessToken);
  } catch (err) {
    await deleteXAuth(input.artistId).catch(() => undefined);
    throw err;
  }
  const avatar = await fetchAvatarBytes(artist.avatarURL);
  const sync = await syncXProfile({
    accessToken: input.tokens.accessToken,
    name: composeProfileName(artist.name),
    bio: composeProfileBio(artist.lore, artist.name),
    avatarBytes: avatar?.bytes ?? null,
    avatarMime: avatar?.mime ?? null,
  });

  const now = firestoreNow();
  const profileSyncUnavailableOnly = isProfileSyncUnavailableError(sync.detail);
  // New connects stay off. A grandfathered connected artist (no flag yet) stays on.
  // An explicit true/false is kept. enabledAt is stamped on the next post check,
  // or when the owner turns the switch on.
  await updateArtistX(input.artistId, {
    status: 'connected',
    username: me.username,
    userId: me.id,
    connectedAt: now,
    pausedAt: null,
    lastError:
      sync.ok || profileSyncUnavailableOnly ? null : sync.detail,
    lastErrorAt: sync.ok || profileSyncUnavailableOnly ? null : now,
    profileSyncedAt: sync.ok ? now : null,
    autoPost: resolveAutoPost(artist.x),
  });

  try {
    recordFunnelEvent(
      input.ownerId,
      'x_connected',
      { artistId: input.artistId },
      input.platform ?? 'unknown'
    );
  } catch (error) {
    console.error('[funnel] x_connected', error instanceof Error ? error.message : 'failed');
  }

  return { username: me.username, profileSyncDetail: sync.detail };
}
