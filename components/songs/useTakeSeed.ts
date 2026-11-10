'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { COLLECTIONS } from '@/lib/firebase/collections';
import {
  takeAudioUrl,
  takeSeedFromParts,
  type TakeGenerationRef,
  type TakeSeed,
  type TakeVersionRef,
} from '@/lib/songs/takes';

function versionFromDoc(id: string, data: TakeVersionRef): TakeVersionRef {
  return {
    id: data.id || id,
    audioURL: data.audioURL ?? null,
    providerOutputId: data.providerOutputId ?? null,
    isPrimary: data.isPrimary === true,
    versionNumber: typeof data.versionNumber === 'number' ? data.versionNumber : 0,
  };
}

function generationFromDoc(data: {
  provider?: string | null;
  status?: string | null;
  providerConversionIds?: string[] | null;
  providerFailedConversions?: string[] | null;
  createdAt?: { toMillis?: () => number } | number | null;
}): TakeGenerationRef {
  let createdAtMs: number | null = null;
  if (typeof data.createdAt === 'number' && Number.isFinite(data.createdAt)) {
    createdAtMs = data.createdAt;
  } else if (data.createdAt && typeof data.createdAt === 'object' && typeof data.createdAt.toMillis === 'function') {
    const ms = data.createdAt.toMillis();
    createdAtMs = Number.isFinite(ms) ? ms : null;
  }
  return {
    provider: data.provider ?? null,
    status: data.status ?? null,
    providerConversionIds: data.providerConversionIds ?? null,
    providerFailedConversions: data.providerFailedConversions ?? null,
    createdAtMs,
  };
}

/**
 * Live takes for the owner. A missing snapshot keeps the seed already shown,
 * so Take 1 stays playable while Take 2 is still on the way.
 */
export function useTakeSeed(songId: string, initial: TakeSeed | null, enabled: boolean): TakeSeed | null {
  const [seed, setSeed] = useState<TakeSeed | null>(initial);

  useEffect(() => {
    setSeed(initial);
  }, [initial]);

  useEffect(() => {
    if (!enabled || !songId) return;
    let versions: TakeVersionRef[] = initial?.versions ?? [];
    let generations: TakeGenerationRef[] = initial
      ? [
          {
            provider: 'musicgpt',
            status: initial.generationStatus,
            providerConversionIds: initial.conversionIds,
            providerFailedConversions: initial.failedConversionIds,
            createdAtMs: 0,
          },
        ]
      : [];
    let currentVersionId = initial?.currentVersionId ?? '';

    const publish = () => {
      const primary = versions.find((version) => version.isPrimary && takeAudioUrl(version));
      if (primary) currentVersionId = primary.id;
      const next = takeSeedFromParts({ currentVersionId, versions, generations });
      if (next) setSeed(next);
    };

    const unsubVersions = onSnapshot(
      query(collection(db, COLLECTIONS.songVersions), where('songId', '==', songId)),
      (snap) => {
        versions = snap.docs.map((doc) => versionFromDoc(doc.id, doc.data() as TakeVersionRef));
        publish();
      },
      () => {
        /* Keep the seed already on screen if this listener is denied. */
      }
    );
    const unsubGenerations = onSnapshot(
      query(collection(db, COLLECTIONS.generations), where('songId', '==', songId)),
      (snap) => {
        generations = snap.docs.map((doc) =>
          generationFromDoc(doc.data() as Parameters<typeof generationFromDoc>[0])
        );
        publish();
      },
      () => {
        /* Keep the seed already on screen if this listener is denied. */
      }
    );
    return () => {
      unsubVersions();
      unsubGenerations();
    };
  }, [enabled, songId, initial]);

  return seed;
}
