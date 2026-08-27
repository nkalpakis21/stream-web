import {
  X_AUTHORIZE_URL,
  X_REVOKE_URL,
  X_SCOPES,
  X_TOKEN_URL,
  basicAuthHeader,
  getXCallbackUrlFromRequest,
  getXClientId,
} from './config';
import { generateOAuthState, generatePkce, type XOAuthSession } from './pkce';

export interface XTokenSet {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  tokenType: string;
  scope: string;
}

interface TokenResponse {
  token_type?: string;
  expires_in?: number;
  access_token?: string;
  scope?: string;
  refresh_token?: string;
}

export function buildAuthorizeUrl(input: {
  request: { url: string; headers: Headers };
  artistId: string;
}): { url: string; session: XOAuthSession } {
  const { verifier, challenge } = generatePkce();
  const state = generateOAuthState();
  const session: XOAuthSession = {
    state,
    verifier,
    artistId: input.artistId,
  };

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: getXClientId(),
    redirect_uri: getXCallbackUrlFromRequest(input.request),
    scope: X_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  return {
    url: `${X_AUTHORIZE_URL}?${params.toString()}`,
    session,
  };
}

async function parseTokenResponse(res: Response, context: string): Promise<XTokenSet> {
  const body = (await res.json().catch(() => ({}))) as TokenResponse & {
    error?: string;
    error_description?: string;
    title?: string;
    detail?: string;
  };
  if (!res.ok || !body.access_token) {
    const message =
      body.error_description ||
      body.detail ||
      body.error ||
      body.title ||
      `${context} failed (${res.status})`;
    throw new Error(message);
  }
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 7200;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || '',
    accessTokenExpiresAt: Date.now() + expiresIn * 1000,
    tokenType: body.token_type || 'bearer',
    scope: body.scope || '',
  };
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  verifier: string;
  request: { url: string; headers: Headers };
}): Promise<XTokenSet> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: getXCallbackUrlFromRequest(input.request),
    code_verifier: input.verifier,
    client_id: getXClientId(),
  });

  const res = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  return parseTokenResponse(res, 'X token exchange');
}

export async function refreshAccessToken(refreshToken: string): Promise<XTokenSet> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: getXClientId(),
  });

  const res = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const tokens = await parseTokenResponse(res, 'X token refresh');
  // X rotates refresh tokens; keep the previous one only if a new one is absent.
  if (!tokens.refreshToken) {
    tokens.refreshToken = refreshToken;
  }
  return tokens;
}

export async function revokeToken(token: string): Promise<void> {
  if (!token) return;
  const params = new URLSearchParams({
    token,
    token_type_hint: 'refresh_token',
    client_id: getXClientId(),
  });
  try {
    await fetch(X_REVOKE_URL, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
  } catch (error) {
    console.warn('[X] revoke failed', error);
  }
}
