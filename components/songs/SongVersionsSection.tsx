'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { SongDocument, SongVersionDocument } from '@/types/firestore';
import { useAuth } from '@/components/providers/AuthProvider';
import { setPrimarySongVersion } from '@/lib/services/songs';
import { getProxiedAudioUrl } from '@/lib/utils/audioProxy';

// Serialized versions for client components (Timestamps converted to numbers)
type SerializedSongVersionDocument = Omit<SongVersionDocument, 'createdAt'> & {
  createdAt: number;
};

type SerializedSongDocument = Omit<SongDocument, 'createdAt' | 'updatedAt' | 'deletedAt'> & {
  createdAt: number;
  updatedAt: number | null;
  deletedAt: number | null;
};

interface SongVersionsSectionProps {
  song: SerializedSongDocument;
  initialVersions: SerializedSongVersionDocument[];
  hasPendingGeneration: boolean;
}

export function SongVersionsSection({
  song,
  initialVersions,
  hasPendingGeneration,
}: SongVersionsSectionProps) {
  const { user } = useAuth();
  const [versions, setVersions] = useState<SerializedSongVersionDocument[]>(initialVersions);
  const [updatingPrimary, setUpdatingPrimary] = useState<string | null>(null);

  const isOwner = user?.uid === song.ownerId;

  // Live updates for new song versions created by the webhook.
  useEffect(() => {
    const q = query(
      collection(db, 'songVersions'),
      where('songId', '==', song.id),
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
  }, [song.id]);

  const playableVersions = useMemo(
    () => {
      const filtered = versions.filter(v => v.audioURL && v.audioURL.trim() !== '');
      console.log('[SongVersionsSection] All versions:', versions);
      console.log('[SongVersionsSection] Playable versions:', filtered);
      filtered.forEach(v => {
        console.log(`[SongVersionsSection] Version ${v.id} audioURL:`, v.audioURL);
      });
      return filtered;
    },
    [versions]
  );

  const primaryVersionId = useMemo(
    () => versions.find(v => v.isPrimary)?.id ?? song.currentVersionId,
    [versions, song.currentVersionId]
  );

  const handleSetPrimary = async (versionId: string) => {
    if (!isOwner) return;
    setUpdatingPrimary(versionId);
    try {
      await setPrimarySongVersion(song.id, versionId);
    } catch (error) {
      console.error('Failed to set primary version', error);
      alert('Failed to set primary version. Please try again.');
    } finally {
      setUpdatingPrimary(null);
    }
  };

  const hasAnyAudio = playableVersions.length > 0;

  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Versions</h2>
        {hasPendingGeneration && !hasAnyAudio && (
          <span className="text-sm text-muted-foreground flex items-center gap-2">
            <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
            Generating…
          </span>
        )}
      </div>

      {hasAnyAudio ? (
        <div className="space-y-4">
          {playableVersions.map((version, index) => {
            const label = String.fromCharCode('A'.charCodeAt(0) + index);
            const isPrimary = version.id === primaryVersionId;

            return (
              <div
                key={version.id}
                className="bg-card rounded-2xl p-6 shadow-soft border border-border/50"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold">Version {label}</span>
                    {isPrimary && (
                      <span className="px-3 py-1 text-xs font-medium rounded-full bg-accent/10 text-accent border border-accent/20">
                        Primary
                      </span>
                    )}
                  </div>
                  {isOwner && !isPrimary && (
                    <button
                      onClick={() => handleSetPrimary(version.id)}
                      disabled={updatingPrimary === version.id}
                      className="text-sm px-4 py-2 rounded-full border border-border hover:bg-muted hover:border-accent/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground"
                    >
                      {updatingPrimary === version.id ? 'Updating…' : 'Set as Primary'}
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <audio
                      controls
                      className="w-full h-12 rounded-lg"
                      src={version.audioURL ? (getProxiedAudioUrl(version.audioURL) || version.audioURL) : undefined}
                      preload="metadata"
                      onError={(e) => {
                        console.error('Audio playback error:', e);
                        console.error('Audio URL:', version.audioURL);
                      }}
                      onLoadStart={() => {
                        console.log('Audio loading started:', version.audioURL);
                      }}
                      onCanPlay={() => {
                        console.log('Audio can play:', version.audioURL);
                      }}
                    >
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
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
            <p className="text-muted-foreground">
              {hasPendingGeneration
                ? 'Generating… Your song versions will appear here shortly.'
                : 'No audio versions yet.'}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}


