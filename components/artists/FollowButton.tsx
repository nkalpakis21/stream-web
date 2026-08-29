'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';
import { followArtist, unfollowArtist, isFollowing } from '@/lib/services/follows';
import { useToast } from '@/components/ui/toast';
import { authHref } from '@/lib/auth/returnTo';

interface FollowButtonProps {
  artistId: string;
  ownerId: string;
  className?: string;
}

export function FollowButton({ artistId, ownerId, className = '' }: FollowButtonProps) {
  const { user } = useAuth();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const isOwnArtist = user?.uid === ownerId;
  const returnTo = `/artists/${artistId}`;

  useEffect(() => {
    if (!user || isOwnArtist) {
      setFollowing(null);
      return;
    }

    const checkFollowing = async () => {
      try {
        const follow = await isFollowing(user.uid, artistId);
        setFollowing(follow !== null);
      } catch (error) {
        console.error('Failed to check follow status:', error);
        setFollowing(false);
      }
    };

    checkFollowing();
  }, [user, artistId, isOwnArtist]);

  const handleFollow = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user || loading || isOwnArtist) return;

    setLoading(true);
    try {
      if (following) {
        await unfollowArtist(user.uid, artistId);
        setFollowing(false);
        showToast('Unfollowed artist', 'success');
      } else {
        await followArtist(user.uid, artistId);
        setFollowing(true);
        showToast('Following artist', 'success');
      }
    } catch (error) {
      console.error('Failed to toggle follow:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update follow status';
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (isOwnArtist) {
    return null;
  }

  if (!user) {
    return (
      <Link
        href={authHref('/signin', returnTo)}
        className={`btn-primary ${className}`.trim()}
        aria-label="Sign in to follow artist"
      >
        Follow
      </Link>
    );
  }

  return (
    <button
      onClick={handleFollow}
      disabled={loading || following === null}
      className={`btn-primary ${className}`.trim()}
      aria-label={following ? 'Unfollow artist' : 'Follow artist'}
    >
      {loading ? '...' : following ? 'Following' : 'Follow'}
    </button>
  );
}
