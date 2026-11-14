'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { PhotoFrameEditor, type PhotoFrameEditorHandle } from '@/components/artists/PhotoFrameEditor';
import {
  SongCreatePreview,
  SongCustomizePanel,
  type LyricsDraftRequest,
} from '@/components/create/SongCustomizePanel';
import { useSongCustomize } from '@/components/create/useSongCustomize';
import { VoiceSheet } from '@/components/voices/VoiceSheet';
import type { PublicStreamstarVoice, VoiceSlug } from '@/lib/voices/streamstarVoices';
import { NEW_ARTIST_TEMPO, type SongCustomizeValue } from '@/lib/create/songOptions';
import { getInitials } from '@/lib/utils/avatar';
import {
  CREATE_MOODS,
  SONG_PROMPT_MAX,
  SONG_PROMPT_PLACEHOLDER,
} from '@/lib/create/oneFlow';

const fieldClass =
  'w-full rounded-[12px] border border-white/10 bg-[#14141C] px-4 text-[#F5F4F8] placeholder:text-[#8B8896] focus:outline-none focus:ring-2 focus:ring-[#E8E6F2]';

export function CreateFlowView({
  name,
  onNameChange,
  nameError,
  prompt,
  onPromptChange,
  promptError,
  activeMood,
  onMood,
  lookPrompt,
  onLookPromptChange,
  faceUrl,
  framingSrc,
  onPickFile,
  onUsePhoto,
  onCancelFrame,
  onGenerate,
  generating,
  uploading,
  looks,
  onPickLook,
  onSkip,
  faceError,
  coin,
  coinError,
  submitError,
  canSubmit,
  submitting,
  onSubmit,
  fileInputRef,
  onCustomizeChange,
  requestDraft,
  voices = [],
  voiceSlug = null,
  onVoiceSelect,
}: {
  name: string;
  onNameChange: (value: string) => void;
  nameError: string | null;
  prompt: string;
  onPromptChange: (value: string) => void;
  promptError: string | null;
  activeMood: string | null;
  onMood: (id: string, prompt: string) => void;
  lookPrompt: string;
  onLookPromptChange: (value: string) => void;
  faceUrl: string | null;
  framingSrc: string | null;
  onPickFile: (file: File | null) => void;
  onUsePhoto: (blob: Blob) => void;
  onCancelFrame: () => void;
  onGenerate: () => void;
  generating: boolean;
  uploading: boolean;
  looks: string[];
  onPickLook: (url: string) => void;
  onSkip: () => void;
  faceError: string | null;
  coin: ReactNode;
  coinError: string | null;
  submitError: string | null;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
  fileInputRef: RefObject<HTMLInputElement>;
  onCustomizeChange?: (value: SongCustomizeValue) => void;
  requestDraft?: LyricsDraftRequest;
  voices?: readonly PublicStreamstarVoice[];
  voiceSlug?: VoiceSlug | null;
  onVoiceSelect?: (slug: VoiceSlug) => void;
}) {
  const frameRef = useRef<PhotoFrameEditorHandle>(null);
  const customize = useSongCustomize({
    name,
    tempoMin: NEW_ARTIST_TEMPO.min,
    tempoMax: NEW_ARTIST_TEMPO.max,
    moods: [],
  });
  useEffect(() => {
    onCustomizeChange?.(customize.value);
  }, [customize.value, onCustomizeChange]);
  const trimmedName = name.trim();
  const initials = trimmedName ? getInitials(trimmedName) : '';
  const [voiceOpen, setVoiceOpen] = useState(false);
  const pickedVoice = voices.find(voice => voice.slug === voiceSlug) ?? null;

  return (
    <form
      data-create-flow
      className="mx-auto w-full max-w-3xl px-4 pb-8 pt-8 md:max-w-5xl"
      onSubmit={event => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <h1 className="font-playfair text-[32px] font-semibold tracking-tight text-[#F5F4F8]">
        Create artist
      </h1>
      <p className="mt-2 text-sm text-[#8B8896]">Name and a first song. A face is optional.</p>

      <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-[220px_minmax(0,1fr)] md:items-start md:gap-12">
        <div>
          <div
            className={`mx-auto flex h-[160px] w-[160px] items-center justify-center overflow-hidden rounded-full md:mx-0 ${
              uploading ? 'opacity-40' : ''
            }`}
            style={{ background: '#14141C' }}
            data-face-disc
            data-face-busy={uploading ? 'true' : undefined}
          >
            {faceUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={faceUrl} alt="" className="h-full w-full object-cover" />
            ) : initials ? (
              <span className="text-[40px] font-semibold text-[#E8E6F2]" data-face-initials>
                {initials}
              </span>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="h-10 w-10"
                aria-hidden
                data-face-placeholder
              >
                <circle cx="12" cy="8" r="3.25" fill="#E8E6F2" fillOpacity="0.4" />
                <path
                  fill="#E8E6F2"
                  fillOpacity="0.4"
                  d="M6.2 18.2c.7-2.6 2.9-4.2 5.8-4.2s5.1 1.6 5.8 4.2c.2.6-.3 1.3-.9 1.3H7.1c-.6 0-1.1-.7-.9-1.3z"
                />
              </svg>
            )}
          </div>

          <button
            type="button"
            data-voice-trigger
            onClick={() => setVoiceOpen(true)}
            className="mt-4 flex w-full flex-col items-start rounded-[12px] bg-[#14141C] px-4 py-3 text-left"
          >
            <span className="text-xs text-[#8B8896]">Voice</span>
            {pickedVoice ? (
              <>
                <span className="mt-1 text-sm font-medium text-[#F5F4F8]" data-voice-name>
                  {pickedVoice.name}
                </span>
                <span className="text-xs text-[#8B8896]" data-voice-descriptor>
                  {pickedVoice.descriptor}
                </span>
              </>
            ) : (
              <span className="mt-1 text-sm text-[#F5F4F8]">Pick a voice</span>
            )}
          </button>
          {voiceOpen ? (
            <VoiceSheet
              voices={voices}
              selected={voiceSlug}
              title="Voice"
              onClose={() => setVoiceOpen(false)}
              onSelect={slug => onVoiceSelect?.(slug)}
            />
          ) : null}

          <label className="mt-4 block text-xs text-[#8B8896]" htmlFor="look-prompt">
            Look prompt, optional
          </label>
          <input
            id="look-prompt"
            type="text"
            maxLength={200}
            value={lookPrompt}
            onChange={event => onLookPromptChange(event.target.value)}
            placeholder="Silver hair, neon jacket"
            className={`${fieldClass} mt-1 h-12`}
          />

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-12 rounded-[12px] bg-[#E8E6F2] text-sm font-semibold text-[#0A0A10]"
            >
              Upload photo
            </button>
            <button
              type="button"
              onClick={onGenerate}
              className="h-12 rounded-[12px] border border-[#E8E6F2] bg-transparent text-sm font-semibold text-[#E8E6F2]"
            >
              {generating ? 'Generating…' : 'Generate'}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={event => {
              const file = event.target.files?.[0] ?? null;
              onPickFile(file);
              event.target.value = '';
            }}
          />

          {framingSrc ? (
            <div className="mt-4">
              <PhotoFrameEditor ref={frameRef} src={framingSrc} circular viewportPx={280} disabled={uploading} />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={uploading}
                  className="h-12 rounded-[12px] bg-[#E8E6F2] text-sm font-semibold text-[#0A0A10] disabled:opacity-40"
                  onClick={() => {
                    if (uploading) return;
                    void frameRef.current?.exportJpeg().then(blob => {
                      if (blob) onUsePhoto(blob);
                    });
                  }}
                >
                  {uploading ? 'Uploading…' : 'Use photo'}
                </button>
                <button
                  type="button"
                  disabled={uploading}
                  className="h-12 rounded-[12px] border border-white/15 text-sm text-[#F5F4F8] disabled:opacity-40"
                  onClick={onCancelFrame}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {generating || looks.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3" data-look-grid>
              {generating
                ? [0, 1, 2, 3].map(index => (
                    <div
                      key={index}
                      data-look-skeleton
                      className="aspect-square rounded-[12px] bg-[#1C1C28] motion-safe:animate-pulse"
                    />
                  ))
                : looks.slice(0, 4).map((url, index) => {
                    const selected = faceUrl === url;
                    return (
                      <button
                        key={url}
                        type="button"
                        aria-pressed={selected}
                        aria-label={`Select look ${index + 1}`}
                        onClick={() => onPickLook(url)}
                        className={`aspect-square overflow-hidden rounded-[12px] ring-2 ${
                          selected ? 'ring-[#E8E6F2]' : 'ring-transparent'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </button>
                    );
                  })}
            </div>
          ) : null}

          {faceUrl ? (
            <button type="button" onClick={onSkip} className="mt-3 text-sm text-[#8B8896]">
              Use initials
            </button>
          ) : null}
          {faceError ? (
            <p role="alert" className="mt-2 text-sm text-[#FF4D6A]">
              {faceError}
            </p>
          ) : null}
        </div>

        <div className="space-y-6">
          <div>
            <label htmlFor="artist-name" className="mb-2 block text-sm font-medium text-[#F5F4F8]">
              Name
            </label>
            <input
              id="artist-name"
              type="text"
              value={name}
              maxLength={32}
              autoComplete="off"
              onChange={event => onNameChange(event.target.value)}
              placeholder="Jimmy"
              aria-invalid={nameError ? true : undefined}
              className={`${fieldClass} h-12`}
            />
            {nameError ? (
              <p role="alert" className="mt-2 text-sm text-[#FF4D6A]">
                {nameError}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="first-song" className="mb-2 block text-sm font-medium text-[#F5F4F8]">
              First song
            </label>
            <div className="mb-3 flex flex-wrap gap-2">
              {CREATE_MOODS.map(mood => {
                const selected = activeMood === mood.id;
                return (
                  <button
                    key={mood.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onMood(mood.id, mood.prompt)}
                    className={`min-h-11 rounded-[12px] border px-3 py-2 text-sm ${
                      selected
                        ? 'border-[#E8E6F2] bg-[#E8E6F2] text-[#0A0A10]'
                        : 'border-white/15 bg-transparent text-[#F5F4F8]'
                    }`}
                  >
                    {mood.label}
                  </button>
                );
              })}
            </div>
            <textarea
              id="first-song"
              rows={3}
              maxLength={SONG_PROMPT_MAX}
              value={prompt}
              onChange={event => onPromptChange(event.target.value)}
              placeholder={SONG_PROMPT_PLACEHOLDER}
              aria-invalid={promptError ? true : undefined}
              className={`${fieldClass} min-h-[4.5rem] py-3`}
            />
            {promptError ? (
              <p role="alert" className="mt-2 text-sm text-[#FF4D6A]">
                {promptError}
              </p>
            ) : null}
            <div className="mt-4">
              <SongCustomizePanel
                artistName={trimmedName}
                defaults={customize.defaults}
                value={customize.value}
                onChange={customize.setValue}
                prompt={prompt}
                requestDraft={requestDraft}
                disabled={submitting}
                voiceDisplay={
                  voiceSlug
                    ? {
                        name: voices.find(voice => voice.slug === voiceSlug)?.name ?? '',
                        descriptor: voices.find(voice => voice.slug === voiceSlug)?.descriptor ?? '',
                      }
                    : null
                }
              />
            </div>
          </div>

          <div>
            {coin}
            {coinError ? (
              <p role="alert" className="mt-2 text-sm text-[#FF4D6A]">
                {coinError}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="sticky bottom-[calc(var(--tab-h,56px)+env(safe-area-inset-bottom,0px))] z-30 -mx-4 mt-8 border-t border-[#2A2A38] bg-[#0A0A10]/95 p-4 md:bottom-0">
        <SongCreatePreview
          artistName={trimmedName}
          defaults={customize.defaults}
          value={customize.value}
          onReset={customize.reset}
        />
        {submitError ? (
          <p role="alert" className="mb-3 text-sm text-[#FF4D6A]">
            {submitError}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!canSubmit || submitting}
          aria-busy={submitting}
          className="h-[52px] w-full rounded-[12px] bg-[#E8E6F2] text-base font-semibold text-[#0A0A10] disabled:opacity-40"
        >
          {submitting ? 'Creating…' : 'Create artist'}
        </button>
      </div>
    </form>
  );
}
