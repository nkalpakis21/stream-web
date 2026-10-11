import { getPublicSongs, getTopSongs, getSongVersions } from '@/lib/services/songs';
import { getArtistCardContext } from '@/lib/server/artistDisplay';
import { fetchCoinQuotes } from '@/lib/solana/fetchCoinQuotes';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import { HomeListenShell } from '@/components/homepage/HomeListenShell';
import type { SongDocument } from '@/types/firestore';
import { coverFieldsFromSong } from '@/lib/covers/resolve';

const HEAT_LIMIT = 8;
const LIVE_LIMIT = 12;
const LIVE_FETCH = 24;

export const revalidate = 120;

async function firstPlayableAudio(songs: SongDocument[]): Promise<{ song: SongDocument; audioUrl: string } | null> {
  for (const song of songs) {
    const versions = await getSongVersions(song.id);
    const audio =
      versions.find(v => v.isPrimary && v.audioURL)?.audioURL ||
      versions.find(v => v.audioURL)?.audioURL ||
      null;
    if (audio) {
      return { song, audioUrl: audio };
    }
  }
  return null;
}

export default async function HomePage() {
  const [latestSongs, topSongs] = await Promise.all([
    getPublicSongs(LIVE_FETCH),
    getTopSongs(HEAT_LIMIT),
  ]);

  const heat = topSongs.length > 0 ? topSongs : latestSongs.slice(0, HEAT_LIMIT);
  const heatIds = new Set(heat.map(song => song.id));
  const liveExclusive = latestSongs.filter(song => !heatIds.has(song.id));
  const live = (liveExclusive.length > 0 ? liveExclusive : latestSongs).slice(0, LIVE_LIMIT);
  const catalog = heat.length ? heat : live;
  const allSongs = [...heat, ...live];
  const unique = Array.from(new Map(allSongs.map(s => [s.id, s])).values());

  const [featured, artistContext] = await Promise.all([
    firstPlayableAudio(catalog),
    getArtistCardContext(unique.map(song => song.artistId)),
  ]);
  const { displays, coins } = artistContext;

  const heatArtistIds = new Set(heat.map(song => song.artistId));
  if (featured) heatArtistIds.add(featured.song.artistId);
  const heatMints = Array.from(heatArtistIds)
    .map(id => coins.get(id)?.mint)
    .filter((mint): mint is string => Boolean(mint));
  const quotes = await fetchCoinQuotes(heatMints);

  const quoteForArtist = (artistId: string): ArtistCoinQuote | null => {
    const mint = coins.get(artistId)?.mint;
    if (!mint) return null;
    return quotes.get(mint) ?? null;
  };

  const artistFields = (artistId: string) => {
    const display = displays.get(artistId);
    const coin = coins.get(artistId);
    return {
      artistName: display?.name || 'Artist',
      artistPhotoUrl: display?.photoUrl ?? null,
      artistLinkable: display?.isPublic === true,
      ticker: coin?.ticker ?? null,
      coinIcon: coin?.coinIcon ?? null,
    };
  };

  return (
    <main className="min-h-screen bg-background">
      <HomeListenShell
        featured={
          featured
            ? {
                songId: featured.song.id,
                title: featured.song.title,
                ...artistFields(featured.song.artistId),
                artistId: featured.song.artistId,
                cover: coverFieldsFromSong(featured.song),
                audioUrl: featured.audioUrl,
                coin: quoteForArtist(featured.song.artistId),
              }
            : null
        }
        heat={heat.map(song => ({
          id: song.id,
          title: song.title,
          ...artistFields(song.artistId),
          artistId: song.artistId,
          cover: coverFieldsFromSong(song),
          playCount: song.playCount ?? 0,
          coin: quoteForArtist(song.artistId),
        }))}
        live={live.map(song => ({
          id: song.id,
          title: song.title,
          ...artistFields(song.artistId),
          artistId: song.artistId,
          cover: coverFieldsFromSong(song),
          playCount: song.playCount ?? 0,
          coin: null,
        }))}
      />
    </main>
  );
}
