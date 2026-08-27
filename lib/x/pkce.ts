import { createHash, createHmac, randomBytes } from 'crypto';
import { getXClientSecret } from './config';

export function base64Url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function generateOAuthState(): string {
  return base64Url(randomBytes(16));
}

export interface XOAuthSession {
  state: string;
  verifier: string;
  artistId: string;
}

function signingKey(): string {
  return getXClientSecret();
}

export function signOAuthSession(session: XOAuthSession): string {
  const payload = base64Url(Buffer.from(JSON.stringify(session), 'utf8'));
  const sig = createHmac('sha256', signingKey()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyOAuthSession(value: string | undefined): XOAuthSession | null {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = createHmac('sha256', signingKey()).update(payload).digest('hex');
  if (sig.length !== expected.length) return null;
  // Constant-time compare
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      typeof json.state === 'string' &&
      typeof json.verifier === 'string' &&
      typeof json.artistId === 'string'
    ) {
      return json as XOAuthSession;
    }
  } catch {
    return null;
  }
  return null;
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a[i] ^ b[i];
  }
  return out === 0;
}
