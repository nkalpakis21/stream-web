'use client';

import { useEffect, useState } from 'react';
import { getFollowerCount } from '@/lib/services/follows';

interface FollowersListProps {
  artistId: string;
  showCount?: boolean;
  showList?: boolean;
  /** Server count. The line stays reserved when this is still unknown. */
  count?: number | null;
}

export function FollowersList({
  artistId,
  showCount = true,
  showList = false,
  count = null,
}: FollowersListProps) {
  const [followerCount, setFollowerCount] = useState<number | null>(
    typeof count === 'number' ? count : null
  );

  useEffect(() => {
    if (typeof count === 'number') {
      setFollowerCount(count);
      return;
    }
    let cancelled = false;

    const loadFollowerCount = async () => {
      try {
        const next = await getFollowerCount(artistId);
        if (!cancelled) setFollowerCount(next);
      } catch (error) {
        console.error('Failed to load follower count:', error);
        if (!cancelled) setFollowerCount(null);
      }
    };

    loadFollowerCount();
    return () => {
      cancelled = true;
    };
  }, [artistId, count]);

  if (!showCount && !showList) {
    return null;
  }

  const label =
    followerCount == null
      ? '\u00A0'
      : `${followerCount} ${followerCount === 1 ? 'follower' : 'followers'}`;

  return (
    <p
      className="text-sm text-[color:var(--mute)]"
      style={{ minHeight: 20, lineHeight: '20px' }}
      aria-busy={followerCount == null}
    >
      {label}
    </p>
  );
}
