'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { LaunchCoinToggle } from '@/components/artists/LaunchCoinToggle';
import { CreateFlowView } from '@/components/create/CreateFlowView';
import { getFreshIdToken, isAuthFailure, userFacingApiError } from '@/lib/api/clientAuth';
import { reportCreateMilestone } from '@/lib/analytics/reportCreate';
import { requestLyricsDraft } from '@/lib/create/lyricsDraftClient';
import {
  NEW_ARTIST_TEMPO,
  artistDefaults,
  initialSongCustomize,
  toWireCreateOptions,
  type SongCustomizeValue,
} from '@/lib/create/songOptions';
import { authHref } from '@/lib/auth/returnTo';
import { webPlatformHeaders } from '@/lib/funnel/platform';
import {
  artistNameError,
  artistNameIssue,
  canSubmitCreate,
  clearCreateDraft,
  readCreateDraft,
  submittedFace,
  titleFromPrompt,
  writeCreateDraft,
  type CreateDraft,
  type CreateFaceMethod,
} from '@/lib/create/oneFlow';
import {
  checkArtistNameAvailable,
  createArtist,
  getArtist,
  getArtistVersion,
  updateArtistAvatar,
} from '@/lib/services/artists';
import { createGeneration } from '@/lib/services/generations';
import { abandonFailedSongCreate, createSong } from '@/lib/services/songs';
import { runSongCreateAttempt, SongCreateFailed } from '@/lib/songs/songCreate';
import {
  confirmArtistPumpFunLaunch,
  resolvePumpFunForArtistCreate,
} from '@/lib/solana/launchArtistPumpFunCoin';
import type { StyleDNA } from '@/types/firestore';

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const ALLOWED_SOURCE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function lookError(status: number | undefined, error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (status === 503 || /FAL_KEY|\bFal\b|fal\.ai|not configured/i.test(raw)) {
    return "Couldn't generate looks right now.";
  }
  return raw.trim() || "Couldn't generate looks right now.";
}

async function rememberFace(method: CreateFaceMethod): Promise<void> {
  try {
    await reportCreateMilestone('face_set', { method });
  } catch (error) {
    console.error('[funnel] face_set', error instanceof Error ? error.message : 'failed');
  }
}

export function OneFlowCreate() {
  const { user } = useAuth();
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, connected, signTransaction, sendTransaction } = useWallet();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startedRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const submitLock = useRef(false);
  const faceUrlRef = useRef<string | null>(null);
  const faceMethodRef = useRef<CreateFaceMethod | null>(null);
  const artistRef = useRef<{ id: string; versionId: string; name: string } | null>(null);
  const generateInFlightRef = useRef(false);
  const uploadInFlightRef = useRef(false);
  const attachGenerateRef = useRef(false);
  const pendingLooksRef = useRef<string[] | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const nameCheckRef = useRef(0);
  const customizeRef = useRef<SongCustomizeValue>(
    initialSongCustomize(artistDefaults({ tempoMin: NEW_ARTIST_TEMPO.min, tempoMax: NEW_ARTIST_TEMPO.max }))
  );
  const nameRef = useRef('');
  const onCustomizeChange = useCallback((value: SongCustomizeValue) => {
    customizeRef.current = value;
  }, []);
  const requestDraft = useCallback(
    (input: { sessionId: string; prompt: string; artistId?: string | null }) =>
      requestLyricsDraft({
        ...input,
        style: input.artistId
          ? undefined
          : {
              name: nameRef.current,
            },
      }),
    []
  );

  const [draft, setDraft] = useState<CreateDraft | null>(null);
  const [nameTaken, setNameTaken] = useState(false);
  const [activeMood, setActiveMood] = useState<string | null>(null);
  const [framingSrc, setFramingSrc] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [looks, setLooks] = useState<string[]>([]);
  const [faceError, setFaceError] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [coinError, setCoinError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const stored = readCreateDraft();
    setDraft(stored);
    faceUrlRef.current = stored.faceUrl;
    faceMethodRef.current = stored.faceMethod;
    if (stored.artistId && stored.artistVersionId) {
      artistRef.current = {
        id: stored.artistId,
        versionId: stored.artistVersionId,
        name: stored.name.trim(),
      };
    }
  }, []);

  useEffect(() => {
    if (!draft) return;
    writeCreateDraft(draft);
  }, [draft]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!user || startedRef.current) return;
    startedRef.current = true;
    void reportCreateMilestone('create_started').catch(error => {
      console.error('[funnel] create_started', error instanceof Error ? error.message : 'failed');
    });
  }, [user]);

  useEffect(() => {
    if (!draft) return;
    const issue = artistNameIssue(draft.name);
    if (issue) {
      setNameTaken(false);
      return;
    }
    const trimmed = draft.name.trim();
    const ticket = nameCheckRef.current + 1;
    nameCheckRef.current = ticket;
    const timer = window.setTimeout(() => {
      void checkArtistNameAvailable(trimmed)
        .then(available => {
          if (nameCheckRef.current !== ticket) return;
          const own = artistRef.current?.name.toLowerCase() === trimmed.toLowerCase();
          setNameTaken(!available && !own);
        })
        .catch(() => {
          if (nameCheckRef.current === ticket) setNameTaken(false);
        });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draft]);

  if (!draft) return <div className="min-h-[50vh]" />;
  nameRef.current = draft.name;

  const nameError = artistNameError(artistNameIssue(draft.name), nameTaken);
  const ready = canSubmitCreate(draft.name, draft.prompt) && !nameTaken;

  const patch = (next: Partial<CreateDraft>) => {
    setDraft(current => (current ? { ...current, ...next } : current));
  };

  const goSignIn = () => {
    router.push(authHref('/signin', '/create'));
  };

  const maybeAttachGenerated = (uid: string) => {
    const artistId = artistRef.current?.id;
    const url = pendingLooksRef.current?.[0];
    if (!attachGenerateRef.current || !artistId || !url) return;
    if (faceUrlRef.current || faceMethodRef.current === 'upload') return;
    attachGenerateRef.current = false;
    faceUrlRef.current = url;
    faceMethodRef.current = 'generate';
    void (async () => {
      await rememberFace('generate');
      try {
        await updateArtistAvatar(artistId, uid, url);
      } catch (error) {
        console.error('[create] attach face', error instanceof Error ? error.message : 'failed');
      }
    })();
  };

  const onPickFile = (file: File | null) => {
    if (!file) return;
    const type = (file.type || '').toLowerCase();
    if (!type.startsWith('image/') || (type && !ALLOWED_SOURCE_TYPES.has(type))) {
      setFaceError('Please choose a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setFaceError('Photo must be 5 MB or smaller.');
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    setFramingSrc(objectUrl);
    setFaceError(null);
  };

  const onUsePhoto = (blob: Blob) => {
    if (!user) {
      goSignIn();
      return;
    }
    if (uploadInFlightRef.current) return;
    uploadInFlightRef.current = true;
    setUploading(true);
    setFaceError(null);
    const uid = user.uid;
    void (async () => {
      try {
        const token = await getFreshIdToken(user);
        const form = new FormData();
        form.append('file', blob, 'look.jpg');
        const response = await fetch('/api/artists/looks/upload', {
          method: 'POST',
          headers: webPlatformHeaders({ Authorization: `Bearer ${token}` }),
          body: form,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || typeof data.url !== 'string' || !/^https?:\/\//i.test(data.url)) {
          throw new Error(userFacingApiError(response.status, data.error, 'Failed to upload photo.'));
        }
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
        setFramingSrc(null);
        faceUrlRef.current = data.url;
        faceMethodRef.current = 'upload';
        patch({ faceUrl: data.url, faceMethod: 'upload' });
        const artistId = artistRef.current?.id;
        if (artistId) {
          await rememberFace('upload');
          await updateArtistAvatar(artistId, uid, data.url);
        }
      } catch (error) {
        if (isAuthFailure(undefined, error)) {
          goSignIn();
          return;
        }
        setFaceError(error instanceof Error ? error.message : 'Failed to upload photo.');
      } finally {
        uploadInFlightRef.current = false;
        setUploading(false);
      }
    })();
  };

  const onGenerate = () => {
    if (!user) {
      goSignIn();
      return;
    }
    if (artistNameIssue(draft.name)) {
      setFaceError('Enter a name before generating a face.');
      return;
    }
    setFaceError(null);
    setGenerating(true);
    generateInFlightRef.current = true;
    const uid = user.uid;
    const task = (async () => {
      const token = await getFreshIdToken(user);
      const response = await fetch('/api/artists/looks', {
        method: 'POST',
        headers: webPlatformHeaders({
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          name: draft.name.trim(),
          lore: '',
          genres: [],
          moods: activeMood ? [activeMood] : [],
          influences: [],
          lookNotes: draft.lookPrompt.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(lookError(response.status, data.error));
      }
      const urls = Array.isArray(data.looks)
        ? data.looks
            .map((look: { url?: string }) => look.url)
            .filter((url: unknown): url is string => typeof url === 'string' && /^https?:\/\//i.test(url))
        : [];
      if (urls.length === 0) throw new Error("Couldn't generate looks right now.");
      return urls.slice(0, 4);
    })();

    void task
      .then(urls => {
        pendingLooksRef.current = urls;
        setLooks(urls);
        maybeAttachGenerated(uid);
      })
      .catch(error => {
        if (isAuthFailure(undefined, error)) {
          goSignIn();
          return;
        }
        setFaceError(lookError(undefined, error));
      })
      .finally(() => {
        generateInFlightRef.current = false;
        setGenerating(false);
      });
  };

  const onPickLook = (url: string) => {
    faceUrlRef.current = url;
    faceMethodRef.current = 'generate';
    attachGenerateRef.current = false;
    patch({ faceUrl: url, faceMethod: 'generate' });
    setFaceError(null);
    const artistId = artistRef.current?.id;
    if (artistId && user) {
      void (async () => {
        await rememberFace('generate');
        try {
          await updateArtistAvatar(artistId, user.uid, url);
        } catch (error) {
          console.error('[create] attach face', error instanceof Error ? error.message : 'failed');
        }
      })();
    }
  };

  const onSkip = () => {
    faceUrlRef.current = null;
    faceMethodRef.current = null;
    attachGenerateRef.current = false;
    patch({ faceUrl: null, faceMethod: null });
    setLooks([]);
    setFaceError(null);
  };

  const onSubmit = () => {
    if (submitLock.current || !user) {
      if (!user) goSignIn();
      return;
    }
    const issue = artistNameIssue(draft.name);
    if (issue === 'empty' || issue === 'length') {
      setSubmitError('Enter a name, 2 to 32 characters.');
      return;
    }
    if (issue === 'charset') {
      return;
    }
    if (!draft.prompt.trim()) {
      setPromptError('Describe the first song.');
      return;
    }
    if (draft.prompt.trim().length > 300) {
      setPromptError('Keep the prompt to 300 characters.');
      return;
    }
    if (nameTaken) return;

    submitLock.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setPromptError(null);
    setCoinError(null);

    const trimmedName = draft.name.trim();
    const prompt = draft.prompt.trim();
    const face = submittedFace({
      method: faceMethodRef.current,
      hasUrl: Boolean(faceUrlRef.current),
      generateInFlight: generateInFlightRef.current,
      uploadInFlight: uploadInFlightRef.current,
    });
    if (generateInFlightRef.current && !faceUrlRef.current) {
      attachGenerateRef.current = true;
    }
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    }
    const idempotencyKey = idempotencyKeyRef.current;
    const uid = user.uid;

    void (async () => {
      try {
        void reportCreateMilestone('create_submitted', { face }).catch(error => {
          console.error('[funnel] create_submitted', error instanceof Error ? error.message : 'failed');
        });

        const available = await checkArtistNameAvailable(trimmedName);
        const ownName = artistRef.current?.name.toLowerCase() === trimmedName.toLowerCase();
        if (!available && !ownName) {
          setNameTaken(true);
          return;
        }

        if (faceUrlRef.current && faceMethodRef.current) {
          await rememberFace(faceMethodRef.current);
        }

        let artistId = artistRef.current?.id ?? null;
        let versionId = artistRef.current?.versionId ?? null;
        if (!artistId || artistRef.current?.name.toLowerCase() !== trimmedName.toLowerCase()) {
          const styleDNA: StyleDNA = {
            genres: [],
            moods: activeMood ? [activeMood] : [],
            tempoRange: { min: NEW_ARTIST_TEMPO.min, max: NEW_ARTIST_TEMPO.max },
            influences: [],
          };
          const pumpWallet =
            connected && publicKey ? { publicKey, signTransaction, sendTransaction } : null;
          const { pumpFun, coinMetadataId, launchNotice } = await resolvePumpFunForArtistCreate({
            launchCoin: draft.launchCoin,
            coinName: draft.coinName.trim() || trimmedName,
            ticker: draft.ticker,
            imageUrl: faceUrlRef.current,
            description: prompt,
            wallet: pumpWallet,
            connection,
            getIdToken: () => getFreshIdToken(user),
          });
          if (launchNotice) setCoinError(launchNotice);

          const artist = await createArtist(uid, {
            name: trimmedName,
            styleDNA,
            lore: prompt,
            vocalIdentity: null,
            avatarURL: faceUrlRef.current,
            isPublic: true,
            pumpFun,
          });
          if (pumpFun.mint && coinMetadataId) {
            try {
              const token = await getFreshIdToken(user);
              await confirmArtistPumpFunLaunch(artist.id, pumpFun, token, coinMetadataId);
            } catch (error) {
              console.error('[create] coin metadata', error instanceof Error ? error.message : 'failed');
            }
          }
          artistId = artist.id;
          versionId = artist.currentVersionId;
          artistRef.current = { id: artist.id, versionId: artist.currentVersionId, name: trimmedName };
          patch({ artistId: artist.id, artistVersionId: artist.currentVersionId });
        } else if (artistId) {
          const existing = await getArtist(artistId);
          if (!existing || existing.ownerId !== uid) {
            artistRef.current = null;
            throw new Error('That artist is no longer available. Try again.');
          }
          versionId = existing.currentVersionId;
        }

        if (!artistId || !versionId) throw new Error('Could not create the artist.');
        const songArtistId = artistId;
        const songVersionId = versionId;
        maybeAttachGenerated(uid);
        const chosen = customizeRef.current;
        const customLyrics =
          chosen.instrumental || chosen.words !== 'mine' ? '' : chosen.lyrics.trim();

        const created = await runSongCreateAttempt({
          createSong: async () => {
            const result = await createSong(uid, {
              artistId: songArtistId,
              artistVersionId: songVersionId,
              title: titleFromPrompt(prompt),
              isPublic: true,
              idempotencyKey,
              prompt,
              lyrics: customLyrics,
            });
            return { id: result.song.id, reused: result.reused };
          },
          createGeneration: async songId => {
            const artistVersion = await getArtistVersion(songVersionId);
            if (!artistVersion) throw new Error('Artist version not found');
            await createGeneration(songId, songVersionId, {
              prompt: { structured: {}, freeText: prompt },
              parameters: { quality: 'medium' },
              provider: 'musicgpt',
              artistId: songArtistId,
              artistContext: {
                styleDNA: artistVersion.styleDNA,
                lore: artistVersion.lore,
                vocalIdentity: artistVersion.vocalIdentity,
              },
              lyrics: customLyrics || undefined,
              createOptions: toWireCreateOptions(chosen),
            });
          },
          abandon: songId => abandonFailedSongCreate(songId, { prompt, lyrics: customLyrics }),
        });

        idempotencyKeyRef.current = null;
        clearCreateDraft();
        router.push(`/artists/${songArtistId}`);
        void created;
      } catch (error) {
        if (isAuthFailure(undefined, error)) {
          goSignIn();
          return;
        }
        const failed = error instanceof SongCreateFailed ? error : null;
        if (!failed || !failed.keepIdempotencyKey) idempotencyKeyRef.current = null;
        console.error('[create]', error instanceof Error ? error.message : 'failed');
        setSubmitError(
          failed?.stage === 'generation'
            ? "Couldn't start the song. Try again."
            : "Couldn't create the artist. Try again."
        );
      } finally {
        submitLock.current = false;
        setSubmitting(false);
      }
    })();
  };

  return (
    <CreateFlowView
      name={draft.name}
      onNameChange={value => patch({ name: value })}
      nameError={nameError}
      prompt={draft.prompt}
      onPromptChange={value => {
        setActiveMood(null);
        setPromptError(null);
        patch({ prompt: value });
      }}
      promptError={promptError}
      activeMood={activeMood}
      onMood={(id, text) => {
        setActiveMood(id);
        setPromptError(null);
        patch({ prompt: text });
      }}
      lookPrompt={draft.lookPrompt}
      onLookPromptChange={value => patch({ lookPrompt: value })}
      faceUrl={draft.faceUrl}
      framingSrc={framingSrc}
      onPickFile={onPickFile}
      onUsePhoto={onUsePhoto}
      onCancelFrame={() => {
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
        setFramingSrc(null);
      }}
      onGenerate={onGenerate}
      generating={generating}
      uploading={uploading}
      looks={looks}
      onPickLook={onPickLook}
      onSkip={onSkip}
      faceError={faceError}
      coin={
        <LaunchCoinToggle
          variant="flat"
          checked={draft.launchCoin}
          onChange={value => patch({ launchCoin: value })}
          artistName={draft.name}
          coinName={draft.coinName}
          onCoinNameChange={value => patch({ coinName: value })}
          ticker={draft.ticker}
          onTickerChange={value => patch({ ticker: value })}
          lookUrl={draft.faceUrl}
          disabled={submitting}
        />
      }
      coinError={coinError}
      submitError={submitError}
      canSubmit={ready}
      submitting={submitting}
      onSubmit={onSubmit}
      fileInputRef={fileInputRef}
      onCustomizeChange={onCustomizeChange}
      requestDraft={requestDraft}
    />
  );
}
