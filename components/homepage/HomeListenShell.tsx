'use client';

import Link from 'next/link';
import Image from 'next/image';
import { PlayableArt } from '@/components/songs/PlayableArt';

export interface ListenTrack {
  id: string;
  title: string;
  artistName: string;
  coverUrl: string | null;
  playCount: number;
  hasCoin: boolean;
}

interface FeaturedTrack {
  songId: string;
  title: string;
  artistName: string;
  coverUrl: string | null;
  audioUrl: string;
  hasCoin: boolean;
}

interface HomeListenShellProps {
  featured: FeaturedTrack | null;
  heat: ListenTrack[];
  live: ListenTrack[];
}

export function HomeListenShell({ featured, heat, live }: HomeListenShellProps) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <section className="rounded-2xl border border-white/10 bg-card/60 p-4 sm:p-6">
          {featured ? (
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="relative w-full max-w-[280px] sm:w-[240px] sm:max-w-none">
                <PlayableArt
                  songId={featured.songId}
                  title={featured.title}
                  artistName={featured.artistName}
                  coverUrl={featured.coverUrl}
                  audioUrl={featured.audioUrl}
                  hasCoin={featured.hasCoin}
                  href={`/songs/${featured.songId}`}
                />
                <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Now playing
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">Listen</p>
                <h1 className="listen-h1 mt-1 text-foreground" data-entity="track">
                  {featured.title}
                </h1>
                <Link
                  href={`/songs/${featured.songId}`}
                  className="mt-1 block text-muted-foreground hover:text-foreground"
                  data-entity="artist"
                >
                  {featured.artistName}
                </Link>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Link href={`/songs/${featured.songId}`} className="listen-btn-primary">
                    Play
                  </Link>
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

        <section className="rounded-2xl border border-white/10 bg-card/60 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="listen-title text-foreground">Heat</h2>
            <Link href="/discover" className="text-xs text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </div>
          {heat.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">No tracks yet.</p>
          ) : (
            <ol className="flex flex-col">
              {heat.map((track, index) => (
                <li key={track.id}>
                  <Link
                    href={`/songs/${track.id}`}
                    className="flex items-center gap-3 rounded-xl px-1 py-2.5 hover:bg-white/5"
                  >
                    <span className="w-5 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                    <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                      {track.coverUrl ? (
                        <Image src={track.coverUrl} alt="" fill className="object-cover" sizes="44px" unoptimized />
                      ) : (
                        <div className="h-full w-full bg-secondary" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground" data-entity="track">{track.title}</p>
                      <p className="truncate text-xs text-muted-foreground" data-entity="artist">{track.artistName}</p>
                    </div>
                    {track.hasCoin && (
                      <span className="flex-shrink-0 text-[10px] font-medium text-primary">Coin</span>
                    )}
                    <svg className="h-4 w-4 flex-shrink-0 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="listen-title text-foreground">Live</h2>
            <p className="text-sm text-muted-foreground">Tracks on Streamstar right now.</p>
          </div>
          <Link href="/discover" className="text-sm text-muted-foreground hover:text-foreground">
            View all
          </Link>
        </div>
        {live.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted-foreground">
            No public tracks yet.
          </p>
        ) : (
          <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 md:grid-cols-4 lg:grid-cols-6">
            {live.map(track => (
              <Link
                key={track.id}
                href={`/songs/${track.id}`}
                className="w-[44vw] flex-shrink-0 sm:w-auto"
              >
                <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
                  {track.coverUrl ? (
                    <Image src={track.coverUrl} alt="" fill className="object-cover" sizes="200px" unoptimized />
                  ) : (
                    <div className="h-full w-full bg-secondary" />
                  )}
                  {track.hasCoin && (
                    <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-primary">
                      Coin
                    </span>
                  )}
                </div>
                <p className="mt-2 truncate text-sm font-medium" data-entity="track">{track.title}</p>
                <p className="truncate text-xs text-muted-foreground" data-entity="artist">{track.artistName}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
