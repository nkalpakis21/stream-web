/**
 * Client-side helpers for Firebase ID-token API calls.
 * Server routes still verify with Admin (`requireUserId`); this only
 * refreshes the token and maps auth failures to a user-facing CTA.
 */

export const SIGN_IN_AGAIN_MESSAGE =
  'Your session expired. Sign in again to continue.';

const AUTH_FAILURE_PATTERN =
  /invalid or expired token|auth-failed|authentication required|auth\/[a-z0-9_-]*(expired|user-token|id-token|unauthenticated|user-signed-out)/i;

function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return '';
}

export function isAuthFailure(status?: number, error?: unknown): boolean {
  if (status === 401) return true;
  return AUTH_FAILURE_PATTERN.test(errorText(error));
}

export function userFacingApiError(
  status: number | undefined,
  error: unknown,
  fallback: string
): string {
  if (isAuthFailure(status, error)) return SIGN_IN_AGAIN_MESSAGE;
  const text = errorText(error).trim();
  return text || fallback;
}

export async function getFreshIdToken(user: {
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
}): Promise<string> {
  return user.getIdToken(true);
}
