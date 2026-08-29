import { getPublicSongs, getTopSongs, getArtistNamesForSongs, getSongVersions } from '@/lib/services/songs';
import { getArtistsData } from '@/lib/services/artists';
import { hasLaunchedCoin } from '@/lib/brand/coin';
import { HomeListenShell } from '@/components/homepage/HomeListenShell';
import type { SongDocument } from '@/types/firestore';

const HEAT_LIMIT = 8;
const LIVE_LIMIT = 12;

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
    getPublicSongs(LIVE_LIMIT),
    getTopSongs(HEAT_LIMIT),
  ]);

  const heat = topSongs.length > 0 ? topSongs : latestSongs.slice(0, HEAT_LIMIT);
  const live = latestSongs.length > 0 ? latestSongs : topSongs;
  const featured = await firstPlayableAudio(heat.length ? heat : live);

  const allSongs = [...heat, ...live, ...(featured ? [featured.song] : [])];
  const unique = Array.from(new Map(allSongs.map(s => [s.id, s])).values());

  const [artistNames, artists] = await Promise.all([
    getArtistNamesForSongs(unique),
    getArtistsData(unique.map(s => s.artistId)),
  ]);

  const coinByArtist = new Map<string, boolean>();
  artists.forEach((artist, id) => {
    coinByArtist.set(id, hasLaunchedCoin(artist.pumpFun));
  });

  return (
    <main className="min-h-screen bg-background">
      <HomeListenShell
        featured={
          featured
            ? {
                songId: featured.song.id,
                title: featured.song.title,
                artistName: artistNames.get(featured.song.id) || 'Artist',
                coverUrl: featured.song.albumCoverThumbnail || featured.song.albumCoverPath,
                audioUrl: featured.audioUrl,
                hasCoin: coinByArtist.get(featured.song.artistId) ?? false,
              }
            : null
        }
        heat={heat.map(song => ({
          id: song.id,
          title: song.title,
          artistName: artistNames.get(song.id) || 'Artist',
          coverUrl: song.albumCoverThumbnail || song.albumCoverPath,
          playCount: song.playCount ?? 0,
          hasCoin: coinByArtist.get(song.artistId) ?? false,
        }))}
        live={live.map(song => ({
          id: song.id,
          title: song.title,
          artistName: artistNames.get(song.id) || 'Artist',
          coverUrl: song.albumCoverThumbnail || song.albumCoverPath,
          playCount: song.playCount ?? 0,
          hasCoin: coinByArtist.get(song.artistId) ?? false,
        }))}
      />
    </main>
  );
}
