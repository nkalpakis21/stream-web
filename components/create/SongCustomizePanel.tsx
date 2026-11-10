'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ENERGY_OPTIONS,
  FEEL_OPTIONS,
  TONE_OPTIONS,
  TONE_ROW_ENABLED,
  customizeChanged,
  defaultsLinkLabel,
  defaultsSummary,
  displayArtistName,
  newLyricsSessionId,
  previewSentence,
  toggleFeel,
  toggleTone,
  type ArtistDefaults,
  type Energy,
  type FeelLabel,
  type LyricsDraftResult,
  type SongCustomizeValue,
  type Tone,
  type VoiceChoice,
} from '@/lib/create/songOptions';

const tileBase =
  'min-h-12 rounded-[12px] border px-3 text-sm font-medium transition-colors';
const tileOff = 'border-[#2A2A38] bg-[#14141C] text-[#F5F4F8]';
const tileOn = 'border-[#E8E6F2] bg-[#E8E6F2] text-[#0A0A10]';

export type LyricsDraftRequest = (input: {
  sessionId: string;
  prompt: string;
  artistId?: string | null;
}) => Promise<LyricsDraftResult>;

function SwitchFace({ on }: { on: boolean }) {
  return (
    <span
      className="relative inline-block h-6 w-11 shrink-0 rounded-[12px]"
      data-on={on ? 'true' : 'false'}
      aria-hidden
      style={{ background: on ? '#E8E6F2' : '#2A2A38' }}
    >
      <span
        className="absolute top-[3px] h-[18px] w-[18px] rounded-full"
        style={{
          background: on ? '#0A0A10' : '#8B8896',
          left: on ? 23 : 3,
        }}
      />
    </span>
  );
}

function EnergyBars({ level }: { level: 1 | 2 | 3 }) {
  const heights = [6, 10, 14];
  return (
    <span className="inline-flex items-end gap-0.5" aria-hidden>
      {heights.map((height, index) => (
        <span
          key={height}
          className="w-[3px] rounded-sm"
          style={{
            height,
            background: 'currentColor',
            opacity: index < level ? 1 : 0.28,
          }}
        />
      ))}
    </span>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <p className="text-sm font-medium text-[#F5F4F8]">{children}</p>;
}

export function SongCreatePreview({
  artistName,
  defaults,
  value,
  onReset,
  toneEnabled = TONE_ROW_ENABLED,
}: {
  artistName?: string | null;
  defaults: ArtistDefaults;
  value: SongCustomizeValue;
  onReset: () => void;
  toneEnabled?: boolean;
}) {
  const changed = customizeChanged(value, defaults);
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <p className="text-sm text-[#F5F4F8]" data-create-preview>
        {previewSentence({ artistName, value, toneEnabled })}
      </p>
      {changed ? (
        <button
          type="button"
          onClick={onReset}
          className="text-sm text-[#8B8896]"
          data-reset-defaults
        >
          {defaultsLinkLabel(artistName)}
        </button>
      ) : null}
    </div>
  );
}

export function SongCustomizePanel({
  artistName,
  artistId,
  defaults,
  value,
  onChange,
  prompt,
  requestDraft,
  disabled,
  initialExpanded = false,
  initialDrafting = false,
  initialConfirming = false,
  initialRemaining = 3,
  initialHasDraft = false,
  toneEnabled = TONE_ROW_ENABLED,
}: {
  artistName?: string | null;
  artistId?: string | null;
  defaults: ArtistDefaults;
  value: SongCustomizeValue;
  onChange: (value: SongCustomizeValue) => void;
  prompt: string;
  requestDraft?: LyricsDraftRequest;
  disabled?: boolean;
  initialExpanded?: boolean;
  initialDrafting?: boolean;
  initialConfirming?: boolean;
  initialRemaining?: number;
  initialHasDraft?: boolean;
  toneEnabled?: boolean;
}) {
  const [open, setOpen] = useState(initialExpanded);
  const [drafting, setDrafting] = useState(initialDrafting);
  const [confirming, setConfirming] = useState(initialConfirming);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [hasDraft, setHasDraft] = useState(initialHasDraft);
  const [draftError, setDraftError] = useState<string | null>(null);
  const lastDraft = useRef<string | null>(null);
  const sessionId = useRef(newLyricsSessionId());
  const mounted = useRef(true);
  const valueRef = useRef(value);
  valueRef.current = value;
  const who = displayArtistName(artistName);
  const named = who === 'They' ? 'the artist' : who;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const patch = (partial: Partial<SongCustomizeValue>) => {
    onChange({ ...value, ...partial });
  };

  const runDraft = async () => {
    if (!requestDraft || drafting || remaining <= 0 || disabled) return;
    setDrafting(true);
    setDraftError(null);
    setConfirming(false);
    try {
      const result = await requestDraft({
        sessionId: sessionId.current,
        prompt,
        artistId,
      });
      if (!mounted.current) return;
      if (result.reason === 'day') {
        setRemaining(0);
        setDraftError(result.error || 'No drafts left today.');
        return;
      }
      if (result.reason === 'session') {
        setRemaining(0);
        setDraftError(result.error || 'This song already has 3 drafts.');
        return;
      }
      if (result.error || !result.lyrics) {
        setDraftError(result.error || 'Could not write a draft.');
        if (typeof result.remaining === 'number') setRemaining(result.remaining);
        return;
      }
      lastDraft.current = result.lyrics;
      setHasDraft(true);
      setRemaining(result.remaining);
      onChange({ ...valueRef.current, words: 'mine', lyrics: result.lyrics });
    } catch (error) {
      if (!mounted.current) return;
      setDraftError(error instanceof Error ? error.message : 'Could not write a draft.');
    } finally {
      if (mounted.current) setDrafting(false);
    }
  };

  const askDraft = () => {
    const edited =
      lastDraft.current !== null &&
      value.lyrics.trim() !== '' &&
      value.lyrics !== lastDraft.current;
    if (edited) {
      setConfirming(true);
      return;
    }
    void runDraft();
  };

  const showVoice = !value.instrumental;
  const showTone = toneEnabled && !value.instrumental;
  const showWords = !value.instrumental;

  return (
    <div data-customize-panel>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        className="flex min-h-12 w-full flex-col items-start justify-center rounded-[12px] border border-[#2A2A38] bg-[#14141C] px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-[#F5F4F8]">Make it yours</span>
        <span className="text-xs text-[#8B8896]" data-customize-summary>
          {defaultsSummary(artistName, defaults)}
        </span>
      </button>

      {open ? (
        <div className="mt-3 space-y-4">
          <button
            type="button"
            role="switch"
            aria-checked={value.instrumental}
            aria-label="Just the beat, no vocals"
            disabled={disabled}
            onClick={() => patch({ instrumental: !value.instrumental })}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[12px] border border-[#2A2A38] bg-[#14141C] px-4 text-left"
          >
            <span className="text-sm text-[#F5F4F8]">Just the beat, no vocals</span>
            <SwitchFace on={value.instrumental} />
          </button>

          {showVoice ? (
            <div>
              <SectionLabel>Voice</SectionLabel>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    ['same', `Same as ${named}`],
                    ['female', 'Her voice'],
                    ['male', 'His voice'],
                  ] as const
                ).map(([id, label]) => {
                  const selected = value.voice === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={selected}
                      data-voice={id}
                      disabled={disabled}
                      onClick={() => patch({ voice: id as VoiceChoice })}
                      className={`${tileBase} ${selected ? tileOn : tileOff}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {showTone ? (
            <div>
              <SectionLabel>How they sing</SectionLabel>
              <div className="mt-2 flex flex-wrap gap-2">
                {TONE_OPTIONS.map(tone => {
                  const selected = value.tone === tone;
                  return (
                    <button
                      key={tone}
                      type="button"
                      aria-pressed={selected}
                      data-tone={tone}
                      disabled={disabled}
                      onClick={() => patch({ tone: toggleTone(value.tone, tone as Tone) })}
                      className={`${tileBase} ${selected ? tileOn : tileOff}`}
                    >
                      {tone}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-[#8B8896]">A nudge, not exact</p>
            </div>
          ) : null}

          {showWords ? (
            <div>
              <SectionLabel>Words</SectionLabel>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={value.words === 'artist'}
                  disabled={disabled}
                  onClick={() => patch({ words: 'artist' })}
                  className={`${tileBase} ${value.words === 'artist' ? tileOn : tileOff}`}
                >
                  {who === 'They' ? 'Let them write it' : `Let ${who} write it`}
                </button>
                <button
                  type="button"
                  aria-pressed={value.words === 'mine'}
                  disabled={disabled}
                  onClick={() => patch({ words: 'mine' })}
                  className={`${tileBase} ${value.words === 'mine' ? tileOn : tileOff}`}
                >
                  Use my words
                </button>
              </div>
              {value.words === 'mine' ? (
                <div className="mt-3">
                  {drafting ? (
                    <div
                      className="rounded-[12px] border border-[#2A2A38] bg-[#14141C] px-4 py-3"
                      data-lyrics-skeleton
                      aria-hidden
                    >
                      <div className="h-3 w-full rounded bg-[#1C1C28] motion-safe:animate-pulse" />
                      <div className="mt-2 h-3 w-11/12 rounded bg-[#1C1C28] motion-safe:animate-pulse" />
                      <div className="mt-2 h-3 w-2/3 rounded bg-[#1C1C28] motion-safe:animate-pulse" />
                    </div>
                  ) : (
                    <textarea
                      aria-label="Your words"
                      rows={6}
                      maxLength={2000}
                      value={value.lyrics}
                      disabled={disabled}
                      onChange={event => patch({ lyrics: event.target.value.slice(0, 2000) })}
                      placeholder="Tip: label parts like [Verse] and [Chorus]"
                      className="w-full rounded-[12px] border border-[#2A2A38] bg-[#14141C] px-4 py-3 text-sm text-[#F5F4F8] placeholder:text-[#8B8896] focus:outline-none focus:ring-2 focus:ring-[#E8E6F2]"
                    />
                  )}
                  <p className="mt-2 text-xs text-[#8B8896]">
                    Tip: label parts like [Verse] and [Chorus]
                  </p>
                  {confirming ? (
                    <div className="mt-3" role="dialog" aria-label="Replace your edits?">
                      <p className="text-sm text-[#F5F4F8]">Replace your edits?</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void runDraft()}
                          className="min-h-12 rounded-[12px] bg-[#E8E6F2] px-4 text-sm font-semibold text-[#0A0A10]"
                        >
                          Replace
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(false)}
                          className={`${tileBase} ${tileOff}`}
                        >
                          Keep mine
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {remaining > 0 && !confirming ? (
                    <button
                      type="button"
                      onClick={askDraft}
                      disabled={disabled || drafting || !requestDraft}
                      className="mt-3 min-h-12 rounded-[12px] bg-[#E8E6F2] px-4 text-sm font-semibold text-[#0A0A10] disabled:opacity-40"
                    >
                      {hasDraft ? `Try another draft (${remaining} left)` : 'Write a draft for me'}
                    </button>
                  ) : null}
                  {draftError ? (
                    <p role="alert" className="mt-2 text-sm text-[#FF4D6A]">
                      {draftError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div>
            <SectionLabel>Feel</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {FEEL_OPTIONS.map(option => {
                const selected = value.feel.includes(option.label);
                const usual = defaults.feel.includes(option.label);
                return (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={selected}
                    data-feel={option.label}
                    data-usual={usual ? 'true' : 'false'}
                    disabled={disabled}
                    onClick={() => patch({ feel: toggleFeel(value.feel, option.label as FeelLabel) })}
                    className={`${tileBase} inline-flex items-center gap-2 ${selected ? tileOn : tileOff}`}
                  >
                    <span
                      aria-hidden
                      className="h-3 w-3 shrink-0 rounded-full border border-[#2A2A38]"
                      style={{ background: option.swatch }}
                    />
                    {option.label}
                    {usual ? (
                      <span className="text-[10px] uppercase tracking-wide opacity-70">usual</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <SectionLabel>Energy</SectionLabel>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {ENERGY_OPTIONS.map(energy => {
                const selected = value.energy === energy;
                const level = energy === 'Slow' ? 1 : energy === 'Steady' ? 2 : 3;
                return (
                  <button
                    key={energy}
                    type="button"
                    aria-pressed={selected}
                    data-energy={energy}
                    disabled={disabled}
                    onClick={() => patch({ energy: energy as Energy })}
                    className={`${tileBase} inline-flex items-center justify-center gap-2 ${selected ? tileOn : tileOff}`}
                  >
                    <EnergyBars level={level} />
                    {energy}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-[#8B8896]">A nudge, not exact</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
