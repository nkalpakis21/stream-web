'use client';

import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/components/providers/AuthProvider';
import { setPrimarySongVersion } from '@/lib/services/songs';
import { useToast, ToastContainer } from '@/components/ui/toast';
import type { SongVersionDocument } from '@/types/firestore';

type SerializedSongVersionDocument = Omit<SongVersionDocument, 'createdAt'> & {
  createdAt: number;
};

interface VersionCardsProps {
  songTitle: string;
  artistName: string;
  artistId?: string;
  albumCoverUrl: string | null;
  initialVersions: SerializedSongVersionDocument[];
  hasPendingGeneration: boolean;
  songId: string;
  ownerId: string;
}

export function VersionCards({
  initialVersions,
  hasPendingGeneration,
  songId,
  ownerId,
}: VersionCardsProps) {
  const { user } = useAuth();
  const [versions, setVersions] = useState<SerializedSongVersionDocument[]>(initialVersions);
  const [updatingPrimary, setUpdatingPrimary] = useState<string | null>(null);
  const { toasts, showToast, dismissToast } = useToast();
  const isOwner = user?.uid === ownerId;

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
  const primaryVersionId = useMemo(
    () => versions.find(v => v.isPrimary)?.id ?? null,
    [versions]
  );

  const handleSetPrimary = async (versionId: string) => {
    if (!isOwner) return;
    setUpdatingPrimary(versionId);
    try {
      await setPrimarySongVersion(songId, versionId);
      showToast('Primary version updated', 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to set primary version.';
      showToast(errorMessage, 'error');
    } finally {
      setUpdatingPrimary(null);
    }
  };

  if (!isOwner && !hasPendingGeneration) {
    return null;
  }

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {hasPendingGeneration ? (
        <div
          className="mb-8 rounded-xl border px-5 py-6"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
        >
          <h3 className="text-base font-semibold text-foreground">Making the track</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            A new version is on the way. It will appear here when it is ready.
          </p>
        </div>
      ) : null}
      {isOwner && playableVersions.length > 1 ? (
        <section className="mb-8">
          <h2 className="mb-4 text-xl font-bold tracking-tight">Versions</h2>
          <div className="flex flex-wrap gap-2">
            {playableVersions.map((version, index) => {
              const label = String.fromCharCode(65 + index);
              const isPrimary = version.id === primaryVersionId;
              return (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => handleSetPrimary(version.id)}
                  disabled={updatingPrimary === version.id || isPrimary}
                  className={`song-stage-chip ${isPrimary ? 'is-selected' : ''}`}
                  aria-label={isPrimary ? 'Current primary version' : `Set Version ${label} as primary`}
                >
                  {isPrimary ? `Primary · Version ${label}` : `Set primary · Version ${label}`}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}
