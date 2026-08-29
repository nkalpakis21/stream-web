'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSongPlayer } from '@/components/songs/SongPlayerProvider';
import { getSongVersions } from '@/lib/services/songs';
import { createDebouncedPlayTracker } from '@/lib/utils/playTracking';
import { formatCoinCluster, type ArtistCoinQuote } from '@/lib/brand/coinStats';
import { EmptyAction } from '@/components/states/EmptyAction';
import './heat.css';

export interface HeatTrack {
  id: string;
  title: string;
  artistName: string;
  artistId: string;
  coverUrl: string | null;
  coin: ArtistCoinQuote | null;
}

function CoinClusterText({ quote }: { quote: ArtistCoinQuote }) {
  const { price, change, mcap, tone } = formatCoinCluster(quote);
  return (
    <>
      {price}
      {' · '}
      <span className={`is-${tone}`}>{change}</span>
      {' · '}
      {mcap}
    </>
  );
}

export function FeaturedCoinMeta({
  artistId,
  quote,
}: {
  artistId: string;
  quote: ArtistCoinQuote | null;
}) {
  if (!quote) return null;
  return (
    <Link href={`/artists/${artistId}`} className="heat-featured-meta">
      <CoinClusterText quote={quote} />
    </Link>
  );
}

function HeatRow({ track, rank }: { track: HeatTrack; rank: number }) {
  const { play, nowPlaying, isPlaying, togglePlayPause } = useSongPlayer();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const trackPlay = useMemo(() => createDebouncedPlayTracker(500), []);

  const isCurrent = nowPlaying?.songId === track.id || (!!audioUrl && nowPlaying?.audioUrl === audioUrl);
  const showPause = Boolean(isCurrent && isPlaying);
  const quote = track.coin;
  const cluster = quote ? formatCoinCluster(quote) : null;
  const rankClass = rank <= 3 ? ` r${rank}` : '';

  const startPlayback = async () => {
    let url = audioUrl;
    if (!url) {
      setLoading(true);
      try {
        const versions = await getSongVersions(track.id);
        url =
          versions.find(v => v.isPrimary && v.audioURL)?.audioURL ||
          versions.find(v => v.audioURL)?.audioURL ||
          null;
        setAudioUrl(url);
      } finally {
        setLoading(false);
      }
    }
    if (!url) return;
    play({
      songId: track.id,
      songTitle: track.title,
      artistName: track.artistName,
      albumCoverUrl: track.coverUrl,
      audioUrl: url,
    });
    trackPlay(track.id);
  };

  const onPlay = () => {
    if (isCurrent) {
      togglePlayPause();
      return;
    }
    void startPlayback();
  };

  return (
    <li>
      <div className={`heat-row${rankClass}${isCurrent && isPlaying ? ' is-playing' : ''}`}>
        <span className="rank">{rank}</span>
        <button type="button" className="heat-hit heat-thumb" onClick={onPlay} aria-label={`Play ${track.title}`}>
          {track.coverUrl ? (
            <Image src={track.coverUrl} alt="" fill className="object-cover" sizes="36px" unoptimized />
          ) : (
            <span className="block h-full w-full" />
          )}
        </button>
        <div className="heat-meta">
          <button type="button" className="heat-hit" onClick={onPlay}>
            <p className="heat-track" data-entity="track">
              {track.title}
            </p>
          </button>
          <div className="heat-artist-line">
            <button type="button" className="heat-hit" onClick={onPlay}>
              <p className="heat-artist" data-entity="artist">
                {track.artistName}
              </p>
            </button>
            {quote ? (
              <Link href={`/artists/${track.artistId}`} className="heat-cluster-inline">
                <CoinClusterText quote={quote} />
              </Link>
            ) : null}
          </div>
        </div>
        {cluster ? (
          <>
            <Link href={`/artists/${track.artistId}`} className="heat-price">
              {cluster.price}
            </Link>
            <Link href={`/artists/${track.artistId}`} className={`heat-chg is-${cluster.tone}`}>
              {cluster.change}
            </Link>
            <Link href={`/artists/${track.artistId}`} className="heat-mcap">
              {cluster.mcap}
            </Link>
          </>
        ) : (
          <>
            <span className="heat-price" />
            <span className="heat-chg" />
            <span className="heat-mcap" />
          </>
        )}
        <button
          type="button"
          className="heat-play"
          onClick={onPlay}
          aria-label={showPause ? `Pause ${track.title}` : `Play ${track.title}`}
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : showPause ? (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      </div>
    </li>
  );
}

export function HeatTape({ tracks }: { tracks: HeatTrack[] }) {
  return (
    <section className="heat-tape rounded-2xl border border-white/10 bg-card/60 p-4 sm:p-5">
      <h2 className="heat-title">Heat</h2>
      {tracks.length === 0 ? (
        <div className="py-8">
          <EmptyAction message="No tracks yet." href="/discover" label="Discover" />
        </div>
      ) : (
        <>
          <div className="heat-cols heat-headers" aria-hidden>
            <span />
            <span />
            <span>TRACK</span>
            <span className="heat-h-price">PRICE</span>
            <span className="heat-h-chg">24H</span>
            <span className="heat-h-mcap">MCAP</span>
            <span />
          </div>
          <ol className="m-0 flex list-none flex-col p-0">
            {tracks.map((track, index) => (
              <HeatRow key={track.id} track={track} rank={index + 1} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
