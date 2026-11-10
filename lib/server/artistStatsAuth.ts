type TokenVerifier = (idToken: string) => Promise<{ uid: string }>;

let verifyForTests: TokenVerifier | null = null;

/** Test-only. Production requests always verify the Firebase ID token. */
export function setArtistStatsAuthForTests(verify: TokenVerifier | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setArtistStatsAuthForTests is disabled in production');
  }
  verifyForTests = verify;
}

export function artistStatsVerifyForTests(): TokenVerifier | undefined {
  return verifyForTests ?? undefined;
}
