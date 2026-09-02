import { hasLaunchedCoin } from '@/lib/brand/coin';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import type { PumpFunCoin, SongDocument } from '@/types/firestore';

export interface FeedCoinArtist {
  id: string;
  name: string;
  avatarURL: string | null;
  buyUrl: string | null;
  quote: ArtistCoinQuote | null;
}

export type FeedEntry =
  | { kind: 'song'; id: string; song: SongDocument }
  | { kind: 'coin'; id: string; artist: FeedCoinArtist };

interface FollowedArtistPayload {
  id?: string;
  name?: string;
  avatarURL?: string | null;
  pumpFun?: PumpFunCoin | null;
}

function asFollowedArtist(value: unknown): FollowedArtistPayload | null {
  if (!value || typeof value !== 'object') return null;
  const artist = value as FollowedArtistPayload;
  return artist.id ? artist : null;
}

export function collectLaunchedMints(artists: unknown[]): string[] {
  const mints: string[] = [];
  const seen = new Set<string>();
  for (const raw of artists) {
    const artist = asFollowedArtist(raw);
    if (!artist || !hasLaunchedCoin(artist.pumpFun)) continue;
    const mint = artist.pumpFun?.mint?.trim();
    if (!mint || seen.has(mint)) continue;
    seen.add(mint);
    mints.push(mint);
  }
  return mints;
}

/**
 * Live quote rows for followed launched artists.
 * These rows ARE the coin-activity surface — no invented trades or fills.
 */
export function launchedFollowedCoins(
  artists: unknown[],
  quotes: Record<string, ArtistCoinQuote | undefined>
): FeedCoinArtist[] {
  const out: FeedCoinArtist[] = [];
  const seen = new Set<string>();

  for (const raw of artists) {
    const artist = asFollowedArtist(raw);
    if (!artist?.id || !hasLaunchedCoin(artist.pumpFun)) continue;
    if (seen.has(artist.id)) continue;
    seen.add(artist.id);
    const mint = artist.pumpFun?.mint?.trim() || '';
    const buyUrl = artist.pumpFun?.url?.trim() || null;
    out.push({
      id: artist.id,
      name: artist.name?.trim() || 'Artist',
      avatarURL: artist.avatarURL ?? null,
      buyUrl,
      quote: mint ? quotes[mint] ?? null : null,
    });
  }

  return out;
}

/**
 * Coin row sits with that artist's newest followed track.
 * Followed launched artists with no track in this page stay at the top.
 */
export function interleaveFeedEntries(
  songs: SongDocument[],
  coins: FeedCoinArtist[]
): FeedEntry[] {
  const remaining = new Map(coins.map(coin => [coin.id, coin]));
  const songArtistIds = new Set(songs.map(song => song.artistId));
  const entries: FeedEntry[] = [];

  for (const coin of coins) {
    if (!songArtistIds.has(coin.id)) {
      entries.push({ kind: 'coin', id: `coin:${coin.id}`, artist: coin });
      remaining.delete(coin.id);
    }
  }

  for (const song of songs) {
    const coin = remaining.get(song.artistId);
    if (coin) {
      entries.push({ kind: 'coin', id: `coin:${coin.id}`, artist: coin });
      remaining.delete(coin.id);
    }
    entries.push({ kind: 'song', id: `song:${song.id}`, song });
  }

  return entries;
}
