import { HttpError } from '@/lib/api/requireAuth';

/**
 * Generic client code for a blocked title or prompt.
 * Never include the matched word in a response or a log.
 */
export const OBJECTIONABLE_CONTENT_CODE = 'objectionable_content';

/**
 * Whole words that must pass. They contain or resemble a blocked word
 * (Scunthorpe, cocktail, Niger) and are not themselves blocked.
 */
export const OBJECTIONABLE_ALLOWLIST = [
  'assassin',
  'cocktail',
  'cocky',
  'niger',
  'scunthorpe',
  'spices',
  'spicy',
] as const;

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};

/** Canonical whole words. A token matches one of these, never a substring. */
const BLOCKED_WORDS = [
  'ass',
  'asshole',
  'chink',
  'cock',
  'cunt',
  'dick',
  'fag',
  'faggot',
  'fuck',
  'kike',
  'nigga',
  'nigger',
  'pussy',
  'rape',
  'rapist',
  'retard',
  'shit',
  'slut',
  'spic',
  'whore',
] as const;

function collapseRepeats(word: string): string {
  return word.replace(/(.)\1+/g, '$1');
}

const ALLOWED_COMPACT = new Set<string>(
  OBJECTIONABLE_ALLOWLIST.map((word) => collapseRepeats(word))
);

function leetFold(input: string): string {
  const plain = input.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  let out = '';
  for (const ch of plain) out += LEET[ch] ?? ch;
  return out;
}

/** Whole token: each letter may repeat, but the letter sequence is exact. */
function wordPattern(word: string): RegExp {
  return new RegExp(`^${[...word].map((ch) => `${ch}+`).join('')}$`);
}

const BLOCK_PATTERNS = BLOCKED_WORDS.map((word) => wordPattern(word));

function isBlockedToken(letters: string): boolean {
  if (!letters) return false;
  return BLOCK_PATTERNS.some((pattern) => pattern.test(letters));
}

function isAllowlistedWord(letters: string): boolean {
  if (!letters) return false;
  if (!ALLOWED_COMPACT.has(collapseRepeats(letters))) return false;
  // Collapsing repeats turns "nigger" into "niger". That token stays blocked.
  return !isBlockedToken(letters);
}

/**
 * Words split on punctuation, plus a join of single letters that were
 * spaced or punctuated apart ("c o c k", "c.o.c.k").
 */
function candidateTokens(folded: string): string[] {
  const parts = folded.split(/[^a-z]+/).filter(Boolean);
  const tokens = [...parts];
  let singles: string[] = [];
  const flush = () => {
    if (singles.length >= 3) tokens.push(singles.join(''));
    singles = [];
  };
  for (const part of parts) {
    if (part.length === 1) singles.push(part);
    else flush();
  }
  flush();
  return tokens;
}

/**
 * True when a blocked whole word appears after case, leetspeak, repeat, and
 * spacing are folded. Allowlisted words pass. Parts of words do not match.
 */
export function hasObjectionableContent(input: string): boolean {
  if (!input) return false;
  for (const token of candidateTokens(leetFold(input))) {
    if (isAllowlistedWord(token)) continue;
    if (isBlockedToken(token)) return true;
  }
  return false;
}

/** Throws 400 objectionable_content. The thrown message is only that code. */
export function assertNoObjectionableContent(
  ...values: Array<string | null | undefined>
): void {
  for (const value of values) {
    if (typeof value === 'string' && hasObjectionableContent(value)) {
      throw new HttpError(400, OBJECTIONABLE_CONTENT_CODE);
    }
  }
}
