'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { getUserArtists } from '@/lib/services/artists';

export function useOwnedArtistCount() {
  const { user, loading: authLoading } = useAuth();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setCount(null);
      return;
    }

    let cancelled = false;
    getUserArtists(user.uid)
      .then((artists) => {
        if (!cancelled) setCount(artists.length);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return {
    count,
    loading: authLoading || Boolean(user && count === null),
    hasArtists: (count ?? 0) > 0,
  };
}
