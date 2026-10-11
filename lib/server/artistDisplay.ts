import type { Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { coinBadgeFromArtist, hasLaunchedCoin } from '@/lib/brand/coin';
import { publicArtistPhotoUrl, type ArtistCardDisplay } from '@/lib/artists/cardDisplay';
import type { AIArtistDocument } from '@/types/firestore';

const GET_ALL_LIMIT = 100;

/** Coin fields used to paint a song card. Never a private artist document. */
export interface ArtistCoinHint {
  ticker: string | null;
  coinIcon: string | null;
  mint: string | null;
  buyUrl: string | null;
}

export interface ArtistCardContext {
  displays: Map<string, ArtistCardDisplay>;
  coins: Map<string, ArtistCoinHint>;
}

function asArtistDisplay(
  id: string,
  data: AIArtistDocument,
  lockedLookUrl: unknown
): ArtistCardDisplay | null {
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name) return null;
  return {
    id,
    name,
    photoUrl: publicArtistPhotoUrl(lockedLookUrl, data.avatarURL),
    isPublic: data.isPublic === true && !data.deletedAt,
  };
}

/**
 * Current-version avatarURL is the locked look. A missing version doc is
 * normal. A failed read is not: log it and throw so photos are not nulled.
 */
async function lockedLooksByVersion(
  db: Firestore,
  versionIds: readonly string[]
): Promise<Map<string, unknown>> {
  const locked = new Map<string, unknown>();
  if (versionIds.length === 0) return locked;
  try {
    for (let i = 0; i < versionIds.length; i += GET_ALL_LIMIT) {
      const chunk = versionIds.slice(i, i + GET_ALL_LIMIT);
      const refs = chunk.map(id => db.collection(COLLECTIONS.artistVersions).doc(id));
      const snaps = await db.getAll(...refs);
      for (const snap of snaps) {
        if (!snap.exists) continue;
        locked.set(snap.id, snap.get('avatarURL'));
      }
    }
  } catch (error) {
    console.error('[artistDisplay] artist version lookup failed', error);
    throw error;
  }
  return locked;
}

function asCoinHint(data: AIArtistDocument): ArtistCoinHint {
  const badge = coinBadgeFromArtist(data);
  const launched = hasLaunchedCoin(data.pumpFun);
  const mint = launched ? data.pumpFun?.mint?.trim() || null : null;
  const buyUrl = launched ? data.pumpFun?.url?.trim() || null : null;
  return {
    ticker: badge?.ticker ?? null,
    coinIcon: badge?.iconSrc ?? null,
    mint,
    buyUrl,
  };
}

/**
 * Admin read of artists for song cards. Returns name, photo, id, and isPublic.
 * Deleted artists stay unlinked. Missing artists are omitted.
 */
export async function getArtistCardContext(
  artistIds: readonly string[],
  db: Firestore = getAdminDb()
): Promise<ArtistCardContext> {
  const unique = [...new Set(artistIds.map(id => id.trim()).filter(Boolean))];
  const displays = new Map<string, ArtistCardDisplay>();
  const coins = new Map<string, ArtistCoinHint>();
  if (unique.length === 0) return { displays, coins };

  const rows: Array<{ id: string; data: AIArtistDocument }> = [];
  for (let i = 0; i < unique.length; i += GET_ALL_LIMIT) {
    const chunk = unique.slice(i, i + GET_ALL_LIMIT);
    const refs = chunk.map(id => db.collection(COLLECTIONS.artists).doc(id));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      rows.push({ id: snap.id, data: snap.data() as AIArtistDocument });
    }
  }

  const versionIds = [
    ...new Set(
      rows
        .map(row => (typeof row.data.currentVersionId === 'string' ? row.data.currentVersionId.trim() : ''))
        .filter(Boolean)
    ),
  ];
  const locked = await lockedLooksByVersion(db, versionIds);

  for (const row of rows) {
    const versionId =
      typeof row.data.currentVersionId === 'string' ? row.data.currentVersionId.trim() : '';
    const display = asArtistDisplay(row.id, row.data, versionId ? locked.get(versionId) ?? null : null);
    if (!display) continue;
    displays.set(row.id, display);
    coins.set(row.id, asCoinHint(row.data));
  }

  return { displays, coins };
}

export function displaysRecord(
  displays: Map<string, ArtistCardDisplay>
): Record<string, ArtistCardDisplay> {
  return Object.fromEntries(displays);
}
