'use client';

import { useEffect, useRef, useState } from 'react';
import { CoverImage } from '@/components/media/CoverImage';
import {
  acquireCoverDecodeSlot,
  releaseCoverDecodeSlot,
} from '@/lib/covers/decodeGate';
import {
  resolveCoverPoster,
  resolveCoverVideo,
  type CoverFields,
} from '@/lib/covers/resolve';
import { subscribeForceCoverStill } from '@/lib/covers/motionPreference';
import './cover-media.css';

export type CoverPlayback = 'visibility' | 'always' | 'still';

const VISIBILITY_THRESHOLD = 0.5;

function useForceCoverStill(): boolean {
  const [forceStill, setForceStill] = useState(true);

  useEffect(() => subscribeForceCoverStill(setForceStill), []);

  return forceStill;
}

function coverIsMostlyVisible(
  entry: Pick<IntersectionObserverEntry, 'isIntersecting' | 'intersectionRatio'>
): boolean {
  return entry.isIntersecting && entry.intersectionRatio >= VISIBILITY_THRESHOLD;
}

function useMostlyVisible(enabled: boolean): {
  ref: (node: HTMLDivElement | null) => void;
  visible: boolean;
} {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled || !node) {
      setVisible(false);
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        setVisible(coverIsMostlyVisible(entry));
      },
      // 0 is required: a 0.5-only threshold never fires on full exit, so
      // isIntersecting stays true and the decode slot is never released.
      { threshold: [0, VISIBILITY_THRESHOLD] }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, node]);

  return { ref: setNode, visible };
}

function useCoverDecodeSlot(want: boolean): boolean {
  const [hasSlot, setHasSlot] = useState(false);

  useEffect(() => {
    if (!want) {
      setHasSlot(false);
      return;
    }

    const { id, granted } = acquireCoverDecodeSlot();
    let cancelled = false;
    granted.then(ok => {
      if (!cancelled) setHasSlot(ok);
    });

    return () => {
      cancelled = true;
      releaseCoverDecodeSlot(id);
      setHasSlot(false);
    };
  }, [want]);

  return hasSlot;
}

interface CoverMediaProps {
  cover: CoverFields;
  title: string;
  sizes: string;
  playback?: CoverPlayback;
  rounded?: string;
  className?: string;
  priority?: boolean;
}

export function CoverMedia({
  cover,
  title,
  sizes,
  playback = 'visibility',
  rounded = 'rounded-cover',
  className = '',
  priority = false,
}: CoverMediaProps) {
  const posterUrl = resolveCoverPoster(cover);
  const videoUrl = resolveCoverVideo(cover);
  const forceStill = useForceCoverStill();
  const motionEligible =
    playback !== 'still' && Boolean(videoUrl) && !forceStill;
  const gateVisibility = playback === 'visibility' && motionEligible;
  const { ref, visible } = useMostlyVisible(gateVisibility);
  const wantSlot = motionEligible && (playback === 'always' || visible);
  const hasSlot = useCoverDecodeSlot(playback === 'visibility' && wantSlot);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const mountVideo =
    motionEligible &&
    !videoFailed &&
    (playback === 'always' || (visible && hasSlot));

  useEffect(() => {
    setVideoFailed(false);
    setVideoReady(false);
  }, [videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !mountVideo) return;
    video.muted = true;
    video.playsInline = true;
    const play = () => {
      video.play().catch(() => undefined);
    };
    play();
    video.addEventListener('canplay', play);
    return () => {
      video.removeEventListener('canplay', play);
      video.pause();
    };
  }, [mountVideo, videoUrl]);

  return (
    <div
      ref={ref}
      className={`cover-media ${rounded} ${className}`.trim()}
      data-cover-playback={playback}
      data-cover-video={mountVideo ? 'on' : 'off'}
    >
      <CoverImage
        src={posterUrl}
        title={title}
        sizes={sizes}
        rounded={rounded}
        priority={priority}
      />
      {mountVideo && videoUrl ? (
        <video
          key={videoUrl}
          ref={videoRef}
          className={`cover-media-video${videoReady ? ' is-ready' : ''}`}
          src={videoUrl}
          muted
          loop
          playsInline
          autoPlay
          preload={playback === 'always' ? 'auto' : 'metadata'}
          disablePictureInPicture
          aria-hidden
          onCanPlay={() => setVideoReady(true)}
          onLoadedData={() => setVideoReady(true)}
          onError={() => {
            setVideoFailed(true);
            setVideoReady(false);
          }}
        />
      ) : null}
    </div>
  );
}
