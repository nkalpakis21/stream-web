/**
 * The ten Streamstar voices. This module is the only copy of the table.
 * Product can change a descriptor or locked prompt here without touching
 * the picker, the events, or the MusicGPT calls.
 *
 * Locked prompts stay in this file. Client code may receive slug, name,
 * gender, descriptor, and a preview path. It must not import this module.
 *
 * Gender uses the same female/male field as Her/His. There is no MusicGPT
 * voice id. Picking a voice adds no credit.
 *
 * The song request is MusicAI create. This repo sends model v6 and does not
 * switch to v7. The locked prompt is prepended on that request and on every
 * Sing Over request. It does not replace the user's words or the artist style.
 */

export const VOICE_PREVIEW_LINE = 'Hold the note and let it fall.';

/** Curated voices do not add a credit on top of the generation that already runs. */
export const VOICE_FEATURE_CREDIT = 0;

export const VOICE_SLUGS = [
  'calla',
  'vesper',
  'sable',
  'wren',
  'briar',
  'harbor',
  'wells',
  'flint',
  'slate',
  'keel',
] as const;

export type VoiceSlug = (typeof VOICE_SLUGS)[number];

export type SungGender = 'female' | 'male';

export type StreamstarVoice = {
  slug: VoiceSlug;
  name: string;
  gender: SungGender;
  /** Public one-liner shown on the row. */
  descriptor: string;
  /** Server-only. Never send this to the client or to analytics. */
  lockedPrompt: string;
};

export type PublicStreamstarVoice = {
  slug: VoiceSlug;
  name: string;
  gender: SungGender;
  descriptor: string;
  previewUrl: string;
};

/**
 * Design table, 2026-11-13. Verbatim.
 * Descriptor is the only descriptive line on a row.
 */
export const STREAMSTAR_VOICES: readonly StreamstarVoice[] = [
  {
    slug: 'calla',
    name: 'Calla',
    gender: 'female',
    descriptor: 'Bright and clear',
    lockedPrompt: 'bright, clear female pop vocal, clean tone, light airy top notes',
  },
  {
    slug: 'vesper',
    name: 'Vesper',
    gender: 'female',
    descriptor: 'Low and smoky',
    lockedPrompt: 'low, smoky female vocal, warm chest tone, slow intimate delivery',
  },
  {
    slug: 'sable',
    name: 'Sable',
    gender: 'female',
    descriptor: 'Dark and soulful',
    lockedPrompt: 'rich soulful female vocal, dark warm tone, controlled runs',
  },
  {
    slug: 'wren',
    name: 'Wren',
    gender: 'female',
    descriptor: 'Soft and breathy',
    lockedPrompt: 'soft breathy female vocal, gentle close-mic delivery, delicate',
  },
  {
    slug: 'briar',
    name: 'Briar',
    gender: 'female',
    descriptor: 'Raw and gritty',
    lockedPrompt: 'raspy gritty female vocal, raw edge, punchy rock delivery',
  },
  {
    slug: 'harbor',
    name: 'Harbor',
    gender: 'male',
    descriptor: 'Warm and steady',
    lockedPrompt: 'warm steady male baritone, smooth and grounded',
  },
  {
    slug: 'wells',
    name: 'Wells',
    gender: 'male',
    descriptor: 'High and sweet',
    lockedPrompt: 'high sweet male tenor, light falsetto, smooth R&B phrasing',
  },
  {
    slug: 'flint',
    name: 'Flint',
    gender: 'male',
    descriptor: 'Sharp and fast',
    lockedPrompt: 'sharp crisp male vocal, rhythmic rap-sung flow, tight delivery',
  },
  {
    slug: 'slate',
    name: 'Slate',
    gender: 'male',
    descriptor: 'Deep and calm',
    lockedPrompt: 'deep calm male bass-baritone, slow rich resonant tone',
  },
  {
    slug: 'keel',
    name: 'Keel',
    gender: 'male',
    descriptor: 'Rough and loud',
    lockedPrompt: 'rough powerful male vocal, gritty belt, big anthemic delivery',
  },
];

export function isVoiceSlug(value: unknown): value is VoiceSlug {
  return typeof value === 'string' && (VOICE_SLUGS as readonly string[]).includes(value);
}

export function voiceBySlug(slug: unknown): StreamstarVoice | null {
  if (!isVoiceSlug(slug)) return null;
  return STREAMSTAR_VOICES.find(voice => voice.slug === slug) ?? null;
}

export function voicePreviewUrl(slug: VoiceSlug): string {
  return `/voices/${slug}.mp3`;
}

/** Client-safe cards. Locked prompts are omitted. */
export function publicStreamstarVoices(): PublicStreamstarVoice[] {
  return STREAMSTAR_VOICES.map(voice => ({
    slug: voice.slug,
    name: voice.name,
    gender: voice.gender,
    descriptor: voice.descriptor,
    previewUrl: voicePreviewUrl(voice.slug),
  }));
}

export function lockedPromptFor(slug: VoiceSlug): string {
  return voiceBySlug(slug)?.lockedPrompt.trim() ?? '';
}

/**
 * Put the locked prompt in front of the text that is already there.
 * The original stays. A second call does not stack the lock.
 */
export function prependLockedPrompt(prompt: string, lockedPrompt: string): string {
  const lock = lockedPrompt.trim();
  const body = prompt.trim();
  if (!lock) throw new Error('Locked prompt is missing');
  if (!body) return lock;
  if (body === lock || body.startsWith(`${lock}\n`) || body.startsWith(`${lock} `)) return body;
  return `${lock}\n${body}`;
}

export type VoicedRequest = {
  prompt: string;
  gender: SungGender;
};

/** Gender plus a prepended lock. Does not add a credit. */
export function voicedRequest(input: { prompt: string; slug: VoiceSlug }): VoicedRequest {
  const voice = voiceBySlug(input.slug);
  if (!voice) throw new Error('Unknown voice');
  const locked = lockedPromptFor(input.slug);
  if (!locked) throw new Error('Voice is not ready');
  return {
    prompt: prependLockedPrompt(input.prompt, locked),
    gender: voice.gender,
  };
}

export function copySaysSoundsLike(text: string): boolean {
  return /sounds like/i.test(text);
}
