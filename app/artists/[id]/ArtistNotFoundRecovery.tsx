'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';

/**
 * The document that rendered this screen is already a 404. After the ID token
 * is verified, store the HttpOnly read cookie and refresh so the owner can
 * load the page. A failed check leaves the 404 in place.
 */
export function ArtistNotFoundRecovery() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const tried = useRef(false);

  useEffect(() => {
    if (loading || !user || tried.current) return;
    const artistId = pathname.match(/^\/artists\/([^/]+)/)?.[1];
    if (!artistId) return;
    tried.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const session = await fetch('/api/auth/viewer', {
          method: 'POST',
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!session.ok) return;
        const response = await fetch(`/api/artists/${artistId}`, {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && response.ok) router.refresh();
      } catch {
        // The 404 document stays. Sign-out clears the cookie separately.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, pathname, router, user]);

  return null;
}
