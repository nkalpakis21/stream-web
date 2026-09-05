'use client';

import { useMemo, useState, type MouseEvent } from 'react';
import { CoverMedia } from '@/components/media/CoverMedia';
import Link from 'next/link';
import { useSongPlayer } from '@/components/songs/SongPlayerProvider';
import { getSongVersions } from '@/lib/services/songs';
import { createDebouncedPlayTracker } from '@/lib/utils/playTracking';
import { formatCoinCluster, formatHeatCoinCluster, type ArtistCoinQuote } from '@/lib/brand/coinStats';
import { EmptyAction } from '@/components/states/EmptyAction';
import { playerCoverPayload, type CoverFields } from '@/lib/covers/resolve';
import './heat.css';

export interface HeatTrack {
  id: string;
  title: string;
  artistName: string;
  artistId: string;
  cover: CoverFields;
  coin: ArtistCoinQuote | null;
}

function CoinClusterText({
  cluster,
}: {
  cluster: ReturnType<typeof formatCoinCluster>;
}) {
  const { price, change, mcap, tone } = cluster;
  return (
    <>
      {price}
      {' · '}
      <span className={`is-${tone}`}>{change}</span>
      <span className="heat-cluster-mcap">
        {' · '}
        {mcap}
      </span>
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
      <CoinClusterText cluster={formatCoinCluster(quote)} />
    </Link>
  );
}

function toQueueItem(track: HeatTrack) {
  return {
    songId: track.id,
    songTitle: track.title,
    artistName: track.artistName,
    artistId: track.artistId,
    ...playerCoverPayload(track.cover),
  };
}

function HeatRow({ track, rank, queue }: { track: HeatTrack; rank: number; queue: HeatTrack[] }) {
  const { play, nowPlaying, isPlaying, togglePlayPause } = useSongPlayer();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const trackPlay = useMemo(() => createDebouncedPlayTracker(500), []);

  const isCurrent = nowPlaying?.songId === track.id || (!!audioUrl && nowPlaying?.audioUrl === audioUrl);
  const showPause = Boolean(isCurrent && isPlaying);
  const quote = track.coin;
  const cluster = formatHeatCoinCluster(quote);
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
    play(
      {
        songId: track.id,
        songTitle: track.title,
        artistName: track.artistName,
        artistId: track.artistId,
        ...playerCoverPayload(track.cover),
        audioUrl: url,
      },
      queue.map(toQueueItem)
    );
    trackPlay(track.id);
  };

  const onPlay = () => {
    if (isCurrent) {
      togglePlayPause();
      return;
    }
    void startPlayback();
  };

  const onArtistNav = (event: MouseEvent) => {
    event.stopPropagation();
  };

  const onPlayControl = (event: MouseEvent) => {
    event.stopPropagation();
    onPlay();
  };

  return (
    <li>
      <div
        className={`heat-row${rankClass}${isCurrent && isPlaying ? ' is-playing' : ''}`}
        onClick={onPlay}
      >
        <span className="rank">{rank}</span>
        <span className="heat-thumb">
          <CoverMedia
            cover={track.cover}
            title={track.title}
            playback="visibility"
            sizes="40px"
            rounded="rounded-[6px]"
          />
        </span>
        <div className="heat-meta">
          <p className="heat-track" data-entity="track">
            {track.title}
          </p>
          <Link
            href={`/artists/${track.artistId}`}
            className="heat-artist"
            data-entity="artist"
            onClick={onArtistNav}
          >
            {track.artistName}
          </Link>
        </div>
        <Link href={`/artists/${track.artistId}`} className="heat-price" onClick={onArtistNav}>
          {cluster.price}
        </Link>
        <Link href={`/artists/${track.artistId}`} className={`heat-chg is-${cluster.tone}`} onClick={onArtistNav}>
          {cluster.change}
        </Link>
        <Link href={`/artists/${track.artistId}`} className="heat-mcap" onClick={onArtistNav}>
          {cluster.mcap}
        </Link>
        <button
          type="button"
          className="heat-play"
          onClick={onPlayControl}
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
    <section className="heat-tape rounded-xl border border-white/10 bg-card/60 p-4 sm:p-5">
      <h2 className="heat-title">Heat</h2>
      {tracks.length === 0 ? (
        <div className="py-8">
          <EmptyAction message="No songs yet." href="/discover" label="Discover" />
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
              <HeatRow key={track.id} track={track} rank={index + 1} queue={tracks} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
