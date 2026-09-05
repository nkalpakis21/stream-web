'use client';

import Link from 'next/link';
import { PlayableArt } from '@/components/songs/PlayableArt';
import { CoinBadge } from '@/components/songs/CoinBadge';
import { EmptyAction } from '@/components/states/EmptyAction';
import { FeaturedCoinMeta, HeatTape } from '@/components/homepage/HeatTape';
import { CoverMedia } from '@/components/media/CoverMedia';
import { useSongPlayer } from '@/components/songs/SongPlayerProvider';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import { playerCoverPayload, type CoverFields } from '@/lib/covers/resolve';

export interface ListenTrack {
  id: string;
  title: string;
  artistName: string;
  artistId: string;
  cover: CoverFields;
  playCount: number;
  hasCoin: boolean;
  coin: ArtistCoinQuote | null;
}

interface FeaturedTrack {
  songId: string;
  title: string;
  artistName: string;
  artistId: string;
  cover: CoverFields;
  audioUrl: string;
  hasCoin: boolean;
  coin: ArtistCoinQuote | null;
}

interface HomeListenShellProps {
  featured: FeaturedTrack | null;
  heat: ListenTrack[];
  live: ListenTrack[];
}

function NowPlayingBadge({ songId }: { songId: string }) {
  const { nowPlaying, isPlaying } = useSongPlayer();
  const live = Boolean(isPlaying && nowPlaying?.songId === songId);
  if (!live) return null;

  return (
    <span className="absolute left-3 top-3 z-20 rounded-xl bg-black/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
      Now playing
    </span>
  );
}

function FeaturedPlay({ featured }: { featured: FeaturedTrack }) {
  const { play, nowPlaying, isPlaying, togglePlayPause } = useSongPlayer();
  const current = nowPlaying?.songId === featured.songId;
  const showPause = Boolean(current && isPlaying);

  const onPlay = () => {
    if (current) {
      togglePlayPause();
      return;
    }
    play({
      songId: featured.songId,
      songTitle: featured.title,
      artistName: featured.artistName,
      artistId: featured.artistId,
      ...playerCoverPayload(featured.cover),
      audioUrl: featured.audioUrl,
    });
  };

  return (
    <button type="button" onClick={onPlay} className="listen-btn-primary">
      {showPause ? 'Pause' : 'Play'}
    </button>
  );
}

export function HomeListenShell({ featured, heat, live }: HomeListenShellProps) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(400px,0.9fr)]">
        <section className="rounded-xl border border-white/10 bg-card/60 p-4 sm:p-6">
          {featured ? (
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="relative w-full max-w-[360px] sm:w-[320px] sm:max-w-none">
                <PlayableArt
                  songId={featured.songId}
                  title={featured.title}
                  artistName={featured.artistName}
                  artistId={featured.artistId}
                  cover={featured.cover}
                  playback="always"
                  audioUrl={featured.audioUrl}
                />
                <NowPlayingBadge songId={featured.songId} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">Listen</p>
                <h1 className="listen-h1 mt-1 text-foreground" data-entity="track">
                  {featured.title}
                </h1>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <Link
                    href={`/artists/${featured.artistId}`}
                    className="min-w-0 truncate text-muted-foreground hover:text-foreground"
                    data-entity="artist"
                  >
                    {featured.artistName}
                  </Link>
                  {featured.hasCoin ? <CoinBadge /> : null}
                </div>
                <FeaturedCoinMeta artistId={featured.artistId} quote={featured.coin} />
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <FeaturedPlay featured={featured} />
                  <Link href="/discover" className="listen-btn-ghost">
                    Discover
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center">
              <h1 className="listen-h1">Nothing playing yet</h1>
              <p className="mt-2 text-muted-foreground">Real tracks from Streamstar will land here.</p>
              <Link href="/discover" className="listen-btn-primary mt-6">
                Discover
              </Link>
            </div>
          )}
        </section>

        <div>
          <div className="mb-3 flex items-end justify-between gap-4">
            <span className="sr-only">Heat</span>
            <Link
              href="/discover?sort=heat"
              className="ml-auto min-h-11 px-2 text-sm text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          </div>
          <HeatTape
            tracks={heat.map(track => ({
              id: track.id,
              title: track.title,
              artistName: track.artistName,
              artistId: track.artistId,
              cover: track.cover,
              coin: track.coin,
            }))}
          />
        </div>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="listen-title text-foreground">New</h2>
            <p className="text-sm text-muted-foreground">Tracks on Streamstar right now.</p>
          </div>
          <Link
            href="/discover?sort=new"
            className="min-h-11 px-2 text-sm text-muted-foreground hover:text-foreground"
          >
            View all
          </Link>
        </div>
        {live.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-12">
            <EmptyAction message="No songs yet." href="/discover" label="Discover" />
          </div>
        ) : (
          <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 md:grid-cols-4 lg:grid-cols-6">
            {live.map((track, index) => (
              <Link
                key={track.id}
                href={`/songs/${track.id}`}
                className="w-[44vw] min-h-11 flex-shrink-0 sm:w-auto"
                style={index === live.length - 1 ? undefined : undefined}
              >
                <div className="relative aspect-square overflow-hidden rounded-xl">
                  <CoverMedia
                    cover={track.cover}
                    title={track.title}
                    playback="visibility"
                    sizes="200px"
                  />
                </div>
                <p className="mt-2 truncate text-sm font-medium" data-entity="track">{track.title}</p>
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="min-w-0 truncate text-xs text-muted-foreground" data-entity="artist">
                    {track.artistName}
                  </p>
                  {track.hasCoin ? <CoinBadge /> : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
