'use client';

import { useEffect, useState } from 'react';
import { getFollowerCount } from '@/lib/services/follows';

interface FollowersListProps {
  artistId: string;
  showCount?: boolean;
  showList?: boolean;
}

export function FollowersList({
  artistId,
  showCount = true,
  showList = false,
}: FollowersListProps) {
  const [followerCount, setFollowerCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadFollowerCount = async () => {
      try {
        const count = await getFollowerCount(artistId);
        if (!cancelled) setFollowerCount(count);
      } catch (error) {
        console.error('Failed to load follower count:', error);
        if (!cancelled) setFollowerCount(null);
      }
    };

    loadFollowerCount();
    return () => {
      cancelled = true;
    };
  }, [artistId]);

  if (!showCount && !showList) {
    return null;
  }

  // Honest count only — hide while loading or if the query failed.
  if (followerCount == null) {
    return null;
  }

  return (
    <p className="text-sm text-[color:var(--mute)]">
      {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
    </p>
  );
}
