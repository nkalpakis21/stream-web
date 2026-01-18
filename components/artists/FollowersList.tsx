'use client';

import { useEffect, useState } from 'react';
import { getFollowerCount, getFollowers } from '@/lib/services/follows';
import { Users } from 'lucide-react';

interface FollowersListProps {
  artistId: string;
  showCount?: boolean;
  showList?: boolean;
}

export function FollowersList({ 
  artistId, 
  showCount = true, 
  showList = false 
}: FollowersListProps) {
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadFollowerCount = async () => {
      try {
        const count = await getFollowerCount(artistId);
        setFollowerCount(count);
      } catch (error) {
        console.error('Failed to load follower count:', error);
        setFollowerCount(0);
      } finally {
        setLoading(false);
      }
    };

    loadFollowerCount();
  }, [artistId]);

  if (!showCount && !showList) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Users className="w-4 h-4" />
        <span className="text-sm">...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Users className="w-4 h-4" />
      <span className="text-sm">
        {followerCount ?? 0} {followerCount === 1 ? 'follower' : 'followers'}
      </span>
    </div>
  );
}
