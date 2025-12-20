'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';

interface SpotifyPlayerProps {
  songTitle: string;
  artistName: string;
  albumCoverUrl: string | null;
  audioUrl: string;
  isPlaying: boolean;
  onPlayPause: () => void;
  onClose: () => void;
}

export function SpotifyPlayer({
  songTitle,
  artistName,
  albumCoverUrl,
  audioUrl,
  isPlaying,
  onPlayPause,
  onClose,
}: SpotifyPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isShuffling, setIsShuffling] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => {
      setCurrentTime(0);
      onPlayPause();
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl, onPlayPause]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.play().catch(console.error);
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
    }
  }, [volume]);

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    audio.currentTime = percentage * duration;
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#181818] border-t border-[#282828] z-50">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-1.5 sm:py-2">
        {/* Progress Bar */}
        <div
          className="h-1 bg-[#5e5e5e] cursor-pointer hover:h-[6px] transition-all mb-1 sm:mb-2"
          onClick={handleProgressClick}
        >
          <div
            className="h-full bg-white hover:bg-[#1db954] transition-colors"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* Main Player Controls */}
        <div className="flex items-center justify-between h-[60px] sm:h-[90px]">
          {/* Left: Song Info */}
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            {albumCoverUrl ? (
              <div className="relative w-10 h-10 sm:w-14 sm:h-14 flex-shrink-0">
                <Image
                  src={albumCoverUrl}
                  alt={songTitle}
                  fill
                  className="object-cover rounded"
                  sizes="56px"
                />
              </div>
            ) : (
              <div className="w-10 h-10 sm:w-14 sm:h-14 bg-[#333] rounded flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 sm:w-6 sm:h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-white text-xs sm:text-sm font-medium truncate">{songTitle}</div>
              <div className="text-[#b3b3b3] text-[10px] sm:text-xs truncate">{artistName}</div>
            </div>
            <button
              onClick={onClose}
              className="text-[#b3b3b3] hover:text-white p-1.5 sm:p-2 transition-colors"
              aria-label="Close player"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>

          {/* Center: Playback Controls */}
          <div className="flex flex-col items-center flex-1">
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Hide shuffle/repeat on mobile */}
              <button
                onClick={() => setIsShuffling(!isShuffling)}
                className={`hidden sm:block p-2 transition-colors ${
                  isShuffling ? 'text-[#1db954]' : 'text-[#b3b3b3] hover:text-white'
                }`}
                aria-label="Shuffle"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
                </svg>
              </button>
              <button
                className="text-[#b3b3b3] hover:text-white p-1.5 sm:p-2 transition-colors"
                aria-label="Previous"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5-6V6z" />
                </svg>
              </button>
              <button
                onClick={onPlayPause}
                className="bg-white text-black rounded-full p-2 sm:p-3 hover:scale-105 transition-transform mx-1 sm:mx-2"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <button
                className="text-[#b3b3b3] hover:text-white p-1.5 sm:p-2 transition-colors"
                aria-label="Next"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              </button>
              <button
                onClick={() => setIsRepeating(!isRepeating)}
                className={`hidden sm:block p-2 transition-colors ${
                  isRepeating ? 'text-[#1db954]' : 'text-[#b3b3b3] hover:text-white'
                }`}
                aria-label="Repeat"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs text-[#b3b3b3] mt-0.5 sm:mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right: Volume & Additional Controls - Hidden on mobile */}
          <div className="hidden md:flex items-center gap-2 flex-1 justify-end">
            <button
              className="text-[#b3b3b3] hover:text-white p-2 transition-colors"
              aria-label="Queue"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
              </svg>
            </button>
            <button
              className="text-[#1db954] p-2 transition-colors"
              aria-label="Connect to device"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 6h18v2H4V6zm0 5h18v2H4v-2zm0 5h18v2H4v-2z" />
                <circle cx="19" cy="19" r="2" />
              </svg>
            </button>
            <div className="flex items-center gap-2 w-32">
              <svg className="w-5 h-5 text-[#b3b3b3]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                className="flex-1 h-1 bg-[#5e5e5e] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                style={{
                  background: `linear-gradient(to right, white 0%, white ${volume * 100}%, #5e5e5e ${volume * 100}%, #5e5e5e 100%)`
                }}
              />
            </div>
            <button
              className="text-[#b3b3b3] hover:text-white p-2 transition-colors"
              aria-label="Full screen"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

