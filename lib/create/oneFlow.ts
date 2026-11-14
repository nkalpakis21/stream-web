/**
 * One-screen create: name, optional face, and the first song prompt.
 * The draft lives in localStorage so a failed submit or a sign-in round-trip
 * keeps every field.
 */

export const CREATE_DRAFT_KEY = 'stream.create.draft.v1';

export const ARTIST_NAME_MIN = 2;
export const ARTIST_NAME_MAX = 32;

export const SONG_PROMPT_MAX = 300;

export const SONG_PROMPT_PLACEHOLDER =
  'A midnight soul song about leaving the city with the windows down, smoky vocal, soft piano, and a chorus that feels like a last look back.';

export const CREATE_MOODS = [
  {
    id: 'late-night',
    label: 'Late night',
    prompt:
      'A late-night R&B ballad about driving home in the rain, warm vocal, slow drums, and a chorus you can sing back.',
  },
  {
    id: 'sunrise',
    label: 'Sunrise',
    prompt:
      'An upbeat indie pop song about the first morning in a new city, bright guitars, and a hook that lifts.',
  },
  {
    id: 'storm',
    label: 'Storm',
    prompt:
      'A dark cinematic hip-hop track with thunder, a low voice, and one line that hits like a door slam.',
  },
] as const;

const NAME_PATTERN = /^[a-zA-Z0-9\s\-_]+$/;

export type CreateFaceMethod = 'upload' | 'generate';

export type CreateDraft = {
  name: string;
  prompt: string;
  lookPrompt: string;
  launchCoin: boolean;
  coinName: string;
  ticker: string;
  faceUrl: string | null;
  faceMethod: CreateFaceMethod | null;
  artistId: string | null;
  artistVersionId: string | null;
};

export function emptyCreateDraft(): CreateDraft {
  return {
    name: '',
    prompt: '',
    lookPrompt: '',
    launchCoin: false,
    coinName: '',
    ticker: '',
    faceUrl: null,
    faceMethod: null,
    artistId: null,
    artistVersionId: null,
  };
}

function isMethod(value: unknown): value is CreateFaceMethod {
  return value === 'upload' || value === 'generate';
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

export function parseCreateDraft(raw: unknown): CreateDraft {
  const blank = emptyCreateDraft();
  if (!raw || typeof raw !== 'object') return blank;
  const record = raw as Record<string, unknown>;
  return {
    name: typeof record.name === 'string' ? record.name.slice(0, 80) : '',
    prompt: typeof record.prompt === 'string' ? record.prompt.slice(0, SONG_PROMPT_MAX) : '',
    lookPrompt: typeof record.lookPrompt === 'string' ? record.lookPrompt.slice(0, 200) : '',
    launchCoin: record.launchCoin === true,
    coinName: typeof record.coinName === 'string' ? record.coinName.slice(0, 32) : '',
    ticker: typeof record.ticker === 'string' ? record.ticker.slice(0, 10) : '',
    faceUrl: isHttpUrl(record.faceUrl) ? record.faceUrl.trim() : null,
    faceMethod: isMethod(record.faceMethod) ? record.faceMethod : null,
    artistId: typeof record.artistId === 'string' ? record.artistId : null,
    artistVersionId: typeof record.artistVersionId === 'string' ? record.artistVersionId : null,
  };
}

export function readCreateDraft(): CreateDraft {
  if (typeof window === 'undefined') return emptyCreateDraft();
  try {
    const raw = window.localStorage.getItem(CREATE_DRAFT_KEY);
    if (!raw) return emptyCreateDraft();
    return parseCreateDraft(JSON.parse(raw));
  } catch {
    return emptyCreateDraft();
  }
}

export function writeCreateDraft(draft: CreateDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // A full disk must not block the form.
  }
}

export function clearCreateDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CREATE_DRAFT_KEY);
  } catch {
    // Ignore.
  }
}

/** Null when the trimmed name can be submitted. */
export function artistNameIssue(name: string): 'empty' | 'length' | 'charset' | null {
  const trimmed = name.trim();
  if (!trimmed) return 'empty';
  if (trimmed.length < ARTIST_NAME_MIN || trimmed.length > ARTIST_NAME_MAX) return 'length';
  if (!NAME_PATTERN.test(trimmed)) return 'charset';
  return null;
}

export function artistNameError(issue: ReturnType<typeof artistNameIssue>, taken: boolean): string | null {
  if (issue === 'length') return 'Use 2 to 32 characters.';
  if (issue === 'charset') return 'Use letters, numbers, spaces, hyphens, or underscores.';
  if (issue === 'empty') return null;
  if (taken) return 'That name is taken.';
  return null;
}

/**
 * Title for the first song. The manager can edit it later on the song.
 * Built from the prompt so create does not wait on another model.
 */
export function titleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const sentence = cleaned.split(/[.!?]/)[0]?.trim() || cleaned;
  const titled = sentence
    .split(' ')
    .filter(Boolean)
    .slice(0, 6)
    .map(word => {
      const core = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
      if (!core) return '';
      return core.charAt(0).toUpperCase() + core.slice(1);
    })
    .filter(Boolean)
    .join(' ')
    .slice(0, 60)
    .trim();
  return titled.length >= 2 ? titled : 'New song';
}

/**
 * What create_submitted records. A running generate or upload counts even
 * when the file is not back yet. Skip, and a cleared face, are none.
 */
export function submittedFace(input: {
  method: CreateFaceMethod | null;
  hasUrl: boolean;
  generateInFlight: boolean;
  uploadInFlight: boolean;
}): 'upload' | 'generate' | 'none' {
  if (input.method === 'upload' && input.hasUrl) return 'upload';
  if (input.method === 'generate' && input.hasUrl) return 'generate';
  if (input.generateInFlight) return 'generate';
  if (input.uploadInFlight) return 'upload';
  return 'none';
}

export function canSubmitCreate(name: string, prompt: string): boolean {
  return artistNameIssue(name) === null && prompt.trim().length > 0 && prompt.trim().length <= SONG_PROMPT_MAX;
}
