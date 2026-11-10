'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { AddVocalsSheet } from '@/components/songs/AddVocalsSheet';
import { BeatFirstView } from '@/components/songs/BeatFirstView';
import { ChangeFeelSheet } from '@/components/songs/ChangeFeelSheet';
import { TakePicker } from '@/components/songs/TakePicker';
import { useTakeSeed } from '@/components/songs/useTakeSeed';
import { getFreshIdToken, userFacingApiError } from '@/lib/api/clientAuth';
import { requestLyricsDraft } from '@/lib/create/lyricsDraftClient';
import {
  artistDefaults,
  initialSongCustomize,
  newLyricsSessionId,
  type SongCustomizeValue,
} from '@/lib/create/songOptions';
import { db } from '@/lib/firebase/config';
import { getSongPath } from '@/lib/firebase/collections';
import { postBeatKeep, postBeatRetry, postBeatVocals } from '@/lib/songs/beatFirstClient';
import { ADDING_VOCALS_LABEL } from '@/lib/songs/beatFirst';
import { buildTakeSlots, shouldShowTakePicker, type TakeSeed, type TakeSlot } from '@/lib/songs/takes';
import type { Energy, FeelLabel } from '@/lib/create/songOptions';
import './pick-your-take.css';

export function BeatFirstScreen({
  songId,
  artistId,
  artistName,
  initialSeed,
  retriesUsed,
  stage,
  prompt,
  feel,
  energy,
}: {
  songId: string;
  artistId: string;
  artistName: string;
  initialSeed: TakeSeed | null;
  retriesUsed: number;
  stage: string;
  prompt: string;
  feel: FeelLabel[];
  energy: Energy;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const seed = useTakeSeed(songId, initialSeed, true);
  const [liveStage, setLiveStage] = useState(stage);
  const [liveRetries, setLiveRetries] = useState(retriesUsed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<TakeSlot | null>(null);
  const [feelOpen, setFeelOpen] = useState(false);
  const [feelValue, setFeelValue] = useState<SongCustomizeValue>(() => ({
    ...initialSongCustomize(artistDefaults({})),
    feel,
    energy,
    instrumental: false,
  }));
  const [sessionId] = useState(() => newLyricsSessionId());
  const slots = buildTakeSlots(seed);

  useEffect(() => {
    return onSnapshot(doc(db, getSongPath(songId)), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as {
        audioReady?: boolean;
        beatFirst?: { stage?: string; retriesUsed?: number };
        path?: string;
      };
      if (typeof data.beatFirst?.stage === 'string') setLiveStage(data.beatFirst.stage);
      if (typeof data.beatFirst?.retriesUsed === 'number') setLiveRetries(data.beatFirst.retriesUsed);
      if (data.audioReady === true) router.refresh();
    });
  }, [songId, router]);

  const withToken = async (
    run: (token: string) => Promise<{ ok: boolean; error?: string }>,
    fallback: string
  ) => {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getFreshIdToken(user);
      const result = await run(token);
      if (!result.ok) {
        const raw = result.error === 'Request failed' ? '' : result.error;
        setError(userFacingApiError(undefined, raw, fallback));
        return;
      }
      router.refresh();
    } catch (err) {
      setError(userFacingApiError(undefined, err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const submitVocals = (value: SongCustomizeValue) => {
    if (!sheet?.versionId) return;
    void withToken(async (token) => {
      const result = await postBeatVocals({
        token,
        songId,
        versionId: sheet.versionId as string,
        voice: value.voice,
        words: value.words,
        lyrics: value.lyrics,
        sessionId,
      });
      if (result.ok) setSheet(null);
      return result;
    }, "Couldn't add vocals.");
  };

  if (liveStage === 'singing') {
    const showPicker = Boolean(seed && shouldShowTakePicker(buildTakeSlots(seed)));
    return (
      <section className="mb-8" data-beat-screen="singing">
        <h2 className="take-title">{ADDING_VOCALS_LABEL}</h2>
        {showPicker && seed ? <TakePicker songId={songId} seed={seed} titleId="beat-vocals-title" /> : (
          <p className="mt-2 text-sm text-[#8B8896]">The two takes will show up here.</p>
        )}
      </section>
    );
  }

  return (
    <section className="mb-8">
      <BeatFirstView
        slots={slots}
        retriesUsed={liveRetries}
        making={liveStage === 'generating'}
        busy={busy}
        error={error}
        onAddVocals={(slot) => setSheet(slot)}
        onRetry={() => {
          void withToken(
            (token) => postBeatRetry({ token, songId, feel: feelValue.feel, energy: feelValue.energy }),
            "Couldn't make a beat."
          );
        }}
        onChangeFeel={() => setFeelOpen(true)}
        onKeep={(slot) => {
          if (!slot.versionId) return;
          void withToken(
            (token) => postBeatKeep({ token, songId, versionId: slot.versionId as string }),
            "Couldn't save this beat."
          );
        }}
      />
      {feelOpen ? (
        <ChangeFeelSheet
          artistName={artistName}
          defaults={artistDefaults({})}
          value={feelValue}
          onChange={setFeelValue}
          onClose={() => setFeelOpen(false)}
          retriesUsed={liveRetries}
          busy={busy}
          error={error}
          onMake={() => {
            void withToken(async (token) => {
              const result = await postBeatRetry({
                token,
                songId,
                feel: feelValue.feel,
                energy: feelValue.energy,
              });
              if (result.ok) setFeelOpen(false);
              return result;
            }, "Couldn't make a beat.");
          }}
        />
      ) : null}
      {sheet ? (
        <AddVocalsSheet
          artistName={artistName}
          artistId={artistId}
          defaults={artistDefaults({})}
          prompt={prompt}
          requestDraft={(input) => requestLyricsDraft({ ...input, sessionId })}
          busy={busy}
          error={error}
          onClose={() => setSheet(null)}
          onSubmit={submitVocals}
        />
      ) : null}
    </section>
  );
}
