'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { followArtist, unfollowArtist, isFollowing } from '@/lib/services/follows';
import { useToast } from '@/components/ui/toast';
import { UserPlus, UserMinus } from 'lucide-react';

interface FollowButtonProps {
  artistId: string;
  ownerId: string; // Add ownerId prop
  className?: string;
}

export function FollowButton({ artistId, ownerId, className = '' }: FollowButtonProps) {
  const { user } = useAuth();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const isOwnArtist = user?.uid === ownerId;

  // Check if user is following this artist
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

    if (!user) {
      showToast('Please sign in to follow artists', 'info');
      return;
    }

    if (loading || isOwnArtist) return;

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

  // Don't show button if not logged in or if it's own artist
  if (!user || isOwnArtist) {
    return null;
  }

  return (
    <button
      onClick={handleFollow}
      disabled={loading || following === null}
      className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
        following
          ? 'border-accent/30 bg-accent/10 text-accent hover:bg-accent/20'
          : 'border-border hover:bg-muted hover:border-accent/20 text-muted-foreground hover:text-foreground'
      } ${className}`}
      aria-label={following ? 'Unfollow artist' : 'Follow artist'}
    >
      {loading ? (
        <>
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">...</span>
        </>
      ) : following ? (
        <>
          <UserMinus className="w-4 h-4" />
          <span className="text-sm font-medium">Following</span>
        </>
      ) : (
        <>
          <UserPlus className="w-4 h-4" />
          <span className="text-sm font-medium">Follow</span>
        </>
      )}
    </button>
  );
}
