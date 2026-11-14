'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { ChangeVoiceSheet } from '@/components/songs/ChangeVoiceSheet';
import { VoiceCompare } from '@/components/songs/VoiceCompare';
import { getFreshIdToken } from '@/lib/api/clientAuth';
import { db } from '@/lib/firebase/config';
import { COLLECTIONS, getSongPath } from '@/lib/firebase/collections';
import { postKeepVoice, postVoiceChange } from '@/lib/songs/voiceChangeClient';
import {
  CHANGE_VOICE_ERROR,
  CHANGING_VOICE_LABEL,
  NO_VOICE_CHANGES_LABEL,
  buildVoiceCompareRows,
  compareHasNewAudio,
  defaultVoiceSelection,
  voiceChangeActionLabel,
  voiceChangeSnapshot,
  voiceChangeSpent,
  voiceChangeSplitsBeat,
  type CompareRow,
  type CompareRowKey,
  type VoiceGenerationRef,
  type VoiceVersionRef,
} from '@/lib/songs/voiceChange';
import type { PublicStreamstarVoice, VoiceSlug } from '@/lib/voices/streamstarVoices';

type VoiceSong = Parameters<typeof voiceChangeSnapshot>[0]['song'];

function versionFromDoc(id: string, data: VoiceVersionRef): VoiceVersionRef {
  return {
    id: data.id || id,
    audioURL: data.audioURL ?? null,
    providerOutputId: data.providerOutputId ?? null,
    isPrimary: data.isPrimary === true,
    versionNumber: typeof data.versionNumber === 'number' ? data.versionNumber : 0,
  };
}

export function ChangeVoice({
  songId,
  ownerId,
  artistVoice = null,
  voices = [],
  songVoiceSlug = null,
  song,
  versions: initialVersions,
  generations: initialGenerations,
  companion,
}: {
  songId: string;
  ownerId: string;
  artistVoice?: string | null;
  voices?: readonly PublicStreamstarVoice[];
  songVoiceSlug?: string | null;
  song: VoiceSong;
  versions: VoiceVersionRef[];
  generations: VoiceGenerationRef[];
  companion?: ReactNode;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [liveSong, setLiveSong] = useState(song);
  const [versions, setVersions] = useState(initialVersions);
  const [generations, setGenerations] = useState(initialGenerations);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CompareRowKey>('1');
  const isOwner = user?.uid === ownerId;
  const snapshot = voiceChangeSnapshot({ song: liveSong, versions, generations });
  const rows = buildVoiceCompareRows({
    originalVersionId: snapshot.originalVersionId,
    originalAudioUrl: snapshot.originalAudioUrl,
    conversionIds: snapshot.conversionIds,
    failedConversionIds: snapshot.failedConversionIds,
    versions,
  });

  const voice1Status = rows[1]?.status;
  const voice2Status = rows[2]?.status;
  useEffect(() => {
    setSelected((current) => defaultVoiceSelection(current, voice1Status, voice2Status));
  }, [voice1Status, voice2Status]);

  useEffect(() => {
    if (!isOwner) return;
    const unsubSong = onSnapshot(
      doc(db, getSongPath(songId)),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as typeof song;
        setLiveSong((current) => ({
          ...current,
          currentVersionId: data.currentVersionId ?? current.currentVersionId,
          voiceChange: data.voiceChange ?? null,
          createOptions: data.createOptions ?? current.createOptions,
          beatFirst: data.beatFirst ?? current.beatFirst,
        }));
      },
      () => {}
    );
    const unsubVersions = onSnapshot(
      query(collection(db, COLLECTIONS.songVersions), where('songId', '==', songId)),
      (snap) => {
        setVersions(snap.docs.map((item) => versionFromDoc(item.id, item.data() as VoiceVersionRef)));
      },
      () => {}
    );
    const unsubGenerations = onSnapshot(
      query(collection(db, COLLECTIONS.generations), where('songId', '==', songId)),
      (snap) => {
        setGenerations(
          snap.docs.map((item) => {
            const data = item.data() as VoiceGenerationRef & { createdAt?: { toMillis?: () => number } };
            const createdAtMs =
              data.createdAt && typeof data.createdAt.toMillis === 'function' ? data.createdAt.toMillis() : null;
            return { ...data, id: item.id, createdAtMs };
          })
        );
      },
      () => {}
    );
    return () => {
      unsubSong();
      unsubVersions();
      unsubGenerations();
    };
  }, [isOwner, songId]);

  if (!isOwner) return null;

  const making = snapshot.status === 'making';
  const hasNewAudio = compareHasNewAudio(rows);
  const showCompare = snapshot.status === 'ready' || (making && hasNewAudio);
  const showMaking = making;
  const failed = snapshot.status === 'failed' && !hasNewAudio;
  const spent = voiceChangeSpent(snapshot.used);
  const showButton = snapshot.show && !showCompare && !making;

  const run = async (task: (token: string) => Promise<{ ok: boolean; error?: string }>) => {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getFreshIdToken(user);
      const result = await task(token);
      if (!result.ok) {
        setError(result.error === NO_VOICE_CHANGES_LABEL ? NO_VOICE_CHANGES_LABEL : CHANGE_VOICE_ERROR);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError(CHANGE_VOICE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  void artistVoice;
  const currentSlug = voices.some(voice => voice.slug === songVoiceSlug)
    ? (songVoiceSlug as VoiceSlug)
    : null;

  const start = (voice: VoiceSlug) => {
    void run((token) => postVoiceChange({ token, songId, voice }));
  };

  const keep = (versionId: string | null) => {
    void run((token) => postKeepVoice({ token, songId, versionId }));
  };

  return (
    <div className="mt-4 flex w-full flex-col items-start gap-3" data-change-voice={snapshot.show ? 'on' : 'off'}>
      <div className="flex flex-wrap items-center gap-3">
        {showMaking ? (
          <p className="text-sm text-[#8B8896]" data-voice-making>
            {CHANGING_VOICE_LABEL}
          </p>
        ) : null}
        {showButton ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground disabled:opacity-40"
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
            disabled={spent}
            aria-disabled={spent ? true : undefined}
          >
            {voiceChangeActionLabel(snapshot.used)}
          </button>
        ) : null}
        {companion}
      </div>
      {showCompare ? (
        <VoiceCompare
          rows={rows}
          selected={selected}
          onSelect={setSelected}
          onKeep={(row: CompareRow) => {
            if (row.versionId) keep(row.versionId);
          }}
          onKeepOriginal={() => keep(null)}
          keeping={busy}
          error={error}
        />
      ) : null}
      {!showCompare && (error || failed) ? (
        <p className="take-error" role="alert">
          {error || CHANGE_VOICE_ERROR}
        </p>
      ) : null}
      {open ? (
        <ChangeVoiceSheet
          voices={voices}
          currentSlug={currentSlug}
          splitCaveat={voiceChangeSplitsBeat(liveSong.path)}
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) setOpen(false);
          }}
          onSubmit={start}
        />
      ) : null}
    </div>
  );
}
