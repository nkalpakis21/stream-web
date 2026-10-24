/**
 * Sign in with Apple token revocation for DELETE /api/account.
 *
 * Apple requires the user's tokens to be revoked when the account is deleted.
 * Config is read from the environment only. This module never logs the private
 * key, client secret, authorization code, or Apple tokens.
 *
 * A missing code or missing env returns "skipped" and does not throw, so
 * account deletion can continue. Apple HTTP failures return "failed" the same
 * way: deletion is not blocked.
 */

import { createPrivateKey, sign } from 'node:crypto';

export const APPLE_PROVIDER_ID = 'apple.com';
const APPLE_AUDIENCE = 'https://appleid.apple.com';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const CLIENT_SECRET_TTL_SECONDS = 10 * 60;
const APPLE_FETCH_TIMEOUT_MS = 15_000;

const ENV_KEYS = [
  'APPLE_TEAM_ID',
  'APPLE_SIWA_KEY_ID',
  'APPLE_SIWA_PRIVATE_KEY',
  'APPLE_SIWA_CLIENT_ID',
] as const;

export type AppleRevokeResult = 'revoked' | 'skipped' | 'failed';

type Warn = (event: string, reason: string) => void;

type AppleEnv = Record<string, string | undefined>;

type AppleSiwaConfig = {
  teamId: string;
  keyId: string;
  privateKey: string;
  clientId: string;
};

function defaultWarn(event: string, reason: string): void {
  console.warn(`[account] ${event}`, reason);
}

/**
 * True when the verified Firebase ID token includes the apple.com provider.
 * `identities` is the token's `firebase.identities` map.
 */
export function hasAppleProvider(user: {
  signInProvider?: string | null;
  identities?: unknown;
}): boolean {
  if (user.signInProvider === APPLE_PROVIDER_ID) return true;
  if (!user.identities || typeof user.identities !== 'object' || Array.isArray(user.identities)) {
    return false;
  }
  const apple = (user.identities as Record<string, unknown>)[APPLE_PROVIDER_ID];
  return Array.isArray(apple) && apple.length > 0;
}

/** Optional DELETE body. Returns null when the code is absent or the body is not JSON. */
export function appleAuthorizationCodeFromBody(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const code = (parsed as { appleAuthorizationCode?: unknown }).appleAuthorizationCode;
    if (typeof code !== 'string') return null;
    const trimmed = code.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function normalizeApplePrivateKey(raw: string): string {
  let key = raw.trim();
  if (
    key.length >= 2 &&
    ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'")))
  ) {
    key = key.slice(1, -1).trim();
  }
  return key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
}

function readAppleSiwaConfig(env: AppleEnv): {
  config: AppleSiwaConfig | null;
  missing: string[];
} {
  const values: Record<(typeof ENV_KEYS)[number], string> = {
    APPLE_TEAM_ID: env.APPLE_TEAM_ID?.trim() ?? '',
    APPLE_SIWA_KEY_ID: env.APPLE_SIWA_KEY_ID?.trim() ?? '',
    APPLE_SIWA_PRIVATE_KEY: normalizeApplePrivateKey(env.APPLE_SIWA_PRIVATE_KEY ?? ''),
    APPLE_SIWA_CLIENT_ID: env.APPLE_SIWA_CLIENT_ID?.trim() ?? '',
  };
  const missing = ENV_KEYS.filter(key => !values[key]);
  if (missing.length > 0) return { config: null, missing: [...missing] };
  return {
    config: {
      teamId: values.APPLE_TEAM_ID,
      keyId: values.APPLE_SIWA_KEY_ID,
      privateKey: values.APPLE_SIWA_PRIVATE_KEY,
      clientId: values.APPLE_SIWA_CLIENT_ID,
    },
    missing: [],
  };
}

function base64url(value: string | Buffer): string {
  const buffer = typeof value === 'string' ? Buffer.from(value) : value;
  return buffer.toString('base64url');
}

function buildAppleClientSecret(input: {
  teamId: string;
  clientId: string;
  keyId: string;
  privateKeyPem: string;
  nowSeconds: number;
}): string {
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: input.keyId }));
  const payload = base64url(
    JSON.stringify({
      iss: input.teamId,
      iat: input.nowSeconds,
      exp: input.nowSeconds + CLIENT_SECRET_TTL_SECONDS,
      aud: APPLE_AUDIENCE,
      sub: input.clientId,
    })
  );
  const signingInput = `${header}.${payload}`;
  const signature = sign('SHA256', Buffer.from(signingInput), {
    key: createPrivateKey(input.privateKeyPem),
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${base64url(signature)}`;
}

async function readAppleErrorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const error = (body as { error?: unknown }).error;
    if (typeof error !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(error)) return null;
    return error;
  } catch {
    return null;
  }
}

async function readRefreshToken(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const token = (body as { refresh_token?: unknown }).refresh_token;
    if (typeof token !== 'string') return null;
    const trimmed = token.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

async function postAppleForm(
  fetchImpl: typeof fetch,
  url: string,
  params: URLSearchParams
): Promise<Response> {
  return fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(APPLE_FETCH_TIMEOUT_MS),
  });
}

async function exchangeAuthorizationCode(input: {
  fetchImpl: typeof fetch;
  clientId: string;
  clientSecret: string;
  code: string;
  warn: Warn;
}): Promise<string | null> {
  let response: Response;
  try {
    response = await postAppleForm(
      input.fetchImpl,
      APPLE_TOKEN_URL,
      new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        code: input.code,
        grant_type: 'authorization_code',
      })
    );
  } catch {
    input.warn('apple token revoke failed', 'token-exchange');
    return null;
  }

  if (!response.ok) {
    const errorCode = await readAppleErrorCode(response);
    input.warn(
      'apple token revoke failed',
      errorCode ? `token-exchange:${errorCode}` : 'token-exchange'
    );
    return null;
  }

  const refreshToken = await readRefreshToken(response);
  if (!refreshToken) {
    input.warn('apple token revoke failed', 'token-exchange:no-refresh-token');
    return null;
  }
  return refreshToken;
}

async function revokeRefreshToken(input: {
  fetchImpl: typeof fetch;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  warn: Warn;
}): Promise<boolean> {
  let response: Response;
  try {
    response = await postAppleForm(
      input.fetchImpl,
      APPLE_REVOKE_URL,
      new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        token: input.refreshToken,
        token_type_hint: 'refresh_token',
      })
    );
  } catch {
    input.warn('apple token revoke failed', 'revoke');
    return false;
  }

  if (!response.ok) {
    const errorCode = await readAppleErrorCode(response);
    input.warn('apple token revoke failed', errorCode ? `revoke:${errorCode}` : 'revoke');
    return false;
  }
  return true;
}

/**
 * Revoke Sign in with Apple for an Apple-linked user.
 * Returns null when the user has no apple.com provider.
 * Does not throw.
 */
export async function revokeAppleOnAccountDeletion(input: {
  appleLinked: boolean;
  authorizationCode: string | null;
  env?: AppleEnv;
  fetchImpl?: typeof fetch;
  warn?: Warn;
  nowSeconds?: number;
}): Promise<AppleRevokeResult | null> {
  if (!input.appleLinked) return null;

  const warn = input.warn ?? defaultWarn;
  try {
    const { config, missing } = readAppleSiwaConfig(input.env ?? process.env);
    if (!config) {
      warn('apple token revoke skipped', `missing-env:${missing.join(',')}`);
      return 'skipped';
    }

    const code = input.authorizationCode?.trim() ?? '';
    if (!code) {
      warn('apple token revoke skipped', 'missing-authorization-code');
      return 'skipped';
    }

    let clientSecret: string;
    try {
      clientSecret = buildAppleClientSecret({
        teamId: config.teamId,
        clientId: config.clientId,
        keyId: config.keyId,
        privateKeyPem: config.privateKey,
        nowSeconds: input.nowSeconds ?? Math.floor(Date.now() / 1000),
      });
    } catch {
      warn('apple token revoke failed', 'client-secret');
      return 'failed';
    }

    const fetchImpl = input.fetchImpl ?? fetch;
    const refreshToken = await exchangeAuthorizationCode({
      fetchImpl,
      clientId: config.clientId,
      clientSecret,
      code,
      warn,
    });
    if (!refreshToken) return 'failed';

    const revoked = await revokeRefreshToken({
      fetchImpl,
      clientId: config.clientId,
      clientSecret,
      refreshToken,
      warn,
    });
    return revoked ? 'revoked' : 'failed';
  } catch {
    warn('apple token revoke failed', 'unexpected');
    return 'failed';
  }
}
