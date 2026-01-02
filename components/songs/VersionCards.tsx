'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { SongPlayCardClient } from './SongPlayCardClient';
import type { SongVersionDocument } from '@/types/firestore';

// Serialized version for client components
type SerializedSongVersionDocument = Omit<SongVersionDocument, 'createdAt'> & {
  createdAt: number;
};

interface VersionCardsProps {
  songTitle: string;
  artistName: string;
  albumCoverUrl: string | null;
  initialVersions: SerializedSongVersionDocument[];
  hasPendingGeneration: boolean;
}

export function VersionCards({
  songTitle,
  artistName,
  albumCoverUrl,
  initialVersions,
  hasPendingGeneration,
}: VersionCardsProps) {
  const [versions, setVersions] = useState<SerializedSongVersionDocument[]>(initialVersions);
  const songId = initialVersions[0]?.songId;

  // Live updates for new song versions created by the webhook
  useEffect(() => {
    if (!songId) return;

    const q = query(
      collection(db, 'songVersions'),
      where('songId', '==', songId),
      orderBy('versionNumber', 'asc')
    );

    const unsubscribe = onSnapshot(q, snapshot => {
      const next: SerializedSongVersionDocument[] = snapshot.docs.map(doc => {
        const data = doc.data() as SongVersionDocument;
        return {
          ...data,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
        };
      });
      setVersions(next);
    });

    return unsubscribe;
  }, [songId]);

  const playableVersions = versions.filter(v => v.audioURL && v.audioURL.trim() !== '');
  const hasAnyAudio = playableVersions.length > 0;

  // Get version label (A, B, C, etc.)
  const getVersionLabel = (index: number) => {
    return String.fromCharCode('A'.charCodeAt(0) + index);
  };

  if (!hasAnyAudio && !hasPendingGeneration) {
    return (
      <div className="p-12 border-2 border-dashed border-border rounded-2xl text-center bg-muted/30">
        <div className="max-w-sm mx-auto">
          <svg
            className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
            />
          </svg>
          <p className="text-muted-foreground">No audio versions yet.</p>
        </div>
      </div>
    );
  }

  return (
    <section className="mb-8 sm:mb-12">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Versions</h2>
      </div>

      {/* Prominent Generating Banner - Apple Style */}
      {hasPendingGeneration && (
        <div className="mb-6 sm:mb-8 relative overflow-hidden rounded-2xl border-2 border-accent/30 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent shadow-lg backdrop-blur-sm">
          {/* Animated gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/10 to-transparent animate-shimmer" />
          
          {/* Content */}
          <div className="relative p-6 sm:p-8 flex items-center gap-4 sm:gap-6">
            {/* Animated Icon */}
            <div className="flex-shrink-0 relative">
              <div className="absolute inset-0 bg-accent/20 rounded-full blur-xl animate-pulse" />
              <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-accent to-accent/80 flex items-center justify-center shadow-lg">
                <svg
                  className="w-6 h-6 sm:w-7 sm:h-7 text-accent-foreground animate-spin"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </div>
            </div>

            {/* Text Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg sm:text-xl font-bold text-foreground mb-1">
                Generating Your Song
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground">
                Your AI artist is creating a new version. This usually takes 1-3 minutes.
              </p>
            </div>

            {/* Pulsing Indicator */}
            <div className="flex-shrink-0 hidden sm:flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
        {playableVersions.map((version, index) => {
          const label = getVersionLabel(index);
          const versionTitle = `${songTitle} (Version ${label})`;

          return (
            <div key={version.id} className="flex flex-col items-center">
              <SongPlayCardClient
                songTitle={versionTitle}
                artistName={artistName}
                albumCoverUrl={albumCoverUrl}
                audioUrl={version.audioURL}
                songId={songId}
              />
              <div className="mt-2 sm:mt-3 text-center">
                <span className="text-xs sm:text-sm font-medium text-foreground">Version {label}</span>
                {version.isPrimary && (
                  <span className="ml-1.5 sm:ml-2 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium rounded-full bg-accent/10 text-accent border border-accent/20">
                    Primary
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

