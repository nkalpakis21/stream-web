'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { shouldRefreshOwnerCatalog } from '@/lib/artists/ownerSongs';

const REFRESH_PREFIX = 'ss-owner-songs-refresh:';

/**
 * The first paint can land before the viewer cookie exists, so the server
 * sent the public list. After the cookie is stored, refresh once so the
 * owner request loads private songs on the server. Fans never refresh.
 */
export function OwnerSongListRecovery({
  artistId,
  ownerId,
  included,
}: {
  artistId: string;
  ownerId: string;
  included: boolean;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const tried = useRef(false);

  useEffect(() => {
    if (loading || tried.current) return;
    if (!shouldRefreshOwnerCatalog(included, user?.uid, ownerId)) return;
    tried.current = true;
    const key = REFRESH_PREFIX + artistId;
    if (sessionStorage.getItem(key)) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await user!.getIdToken();
        const session = await fetch('/api/auth/viewer', {
          method: 'POST',
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!session.ok || cancelled) return;
        sessionStorage.setItem(key, '1');
        router.refresh();
      } catch {
        // The public list stays.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artistId, included, loading, ownerId, router, user]);

  return null;
}
