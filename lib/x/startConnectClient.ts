'use client';

import type { User } from 'firebase/auth';

/**
 * Start per-artist X OAuth after create (or from the artist page).
 * Redirects the browser to X. Returns an error string if OAuth cannot start.
 */
export async function startArtistXConnect(
  user: User,
  artistId: string
): Promise<string | null> {
  const token = await user.getIdToken();
  const res = await fetch('/api/x/connect', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ artistId }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 503 || data.available === false) {
    return (
      data.error ||
      'X is not configured (set X_CLIENT_ID and X_CLIENT_SECRET). Your artist was created without X connected.'
    );
  }
  if (!res.ok || !data.authorizeUrl) {
    return data.error || 'Could not start X connect. Open the artist page to try again.';
  }
  window.location.href = data.authorizeUrl as string;
  return null;
}
