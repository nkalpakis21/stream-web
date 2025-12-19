'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { SongDocument, SongVersionDocument } from '@/types/firestore';
import { useAuth } from '@/components/providers/AuthProvider';
import { setPrimarySongVersion } from '@/lib/services/songs';

interface SongVersionsSectionProps {
  song: SongDocument;
  initialVersions: SongVersionDocument[];
  hasPendingGeneration: boolean;
}

export function SongVersionsSection({
  song,
  initialVersions,
  hasPendingGeneration,
}: SongVersionsSectionProps) {
  const { user } = useAuth();
  const [versions, setVersions] = useState<SongVersionDocument[]>(initialVersions);
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
      const next: SongVersionDocument[] = snapshot.docs.map(doc => doc.data() as SongVersionDocument);
      setVersions(next);
    });

    return unsubscribe;
  }, [song.id]);

  const playableVersions = useMemo(
    () => versions.filter(v => !!v.audioURL),
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
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold">Versions</h2>
        {hasPendingGeneration && !hasAnyAudio && (
          <span className="text-sm text-yellow-500">
            Generating… You&apos;ll see versions here when they are ready.
          </span>
        )}
      </div>

      {hasAnyAudio ? (
        <div className="space-y-6">
          {playableVersions.map((version, index) => {
            const label = String.fromCharCode('A'.charCodeAt(0) + index);
            const isPrimary = version.id === primaryVersionId;

            return (
              <div
                key={version.id}
                className="border border-gray-200 dark:border-gray-800 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Version {label}</span>
                    {isPrimary && (
                      <span className="px-2 py-0.5 text-xs rounded bg-blue-600 text-white">
                        Primary
                      </span>
                    )}
                  </div>
                  {isOwner && !isPrimary && (
                    <button
                      onClick={() => handleSetPrimary(version.id)}
                      disabled={updatingPrimary === version.id}
                      className="text-sm px-3 py-1 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {updatingPrimary === version.id ? 'Updating…' : 'Mark as primary'}
                    </button>
                  )}
                </div>

                <audio
                  controls
                  className="w-full"
                  src={version.audioURL || undefined}
                >
                  Your browser does not support the audio element.
                </audio>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-6 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-center text-gray-500">
          {hasPendingGeneration
            ? 'Generating… Your song versions will appear here shortly.'
            : 'No audio versions yet.'}
        </div>
      )}
    </section>
  );
}


