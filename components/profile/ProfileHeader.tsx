'use client';

import { User } from 'firebase/auth';

interface ProfileHeaderProps {
  user: User;
  stats: {
    songsCount: number;
    artistsCount: number;
    totalPlays: number;
  };
}

export function ProfileHeader({ user, stats }: ProfileHeaderProps) {
  const displayName = user.displayName || user.email?.split('@')[0] || 'User';
  const avatarUrl = user.photoURL;

  return (
    <div className="mb-12">
      {/* Main Header Section */}
      <div className="mb-10">
        {/* User Info */}
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-2 text-foreground">
            {displayName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {user.email}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-8">
        <div>
          <div className="text-2xl font-semibold text-foreground mb-0.5">
            {stats.songsCount}
          </div>
          <div className="text-xs text-muted-foreground">
            Songs
          </div>
        </div>
        <div>
          <div className="text-2xl font-semibold text-foreground mb-0.5">
            {stats.artistsCount}
          </div>
          <div className="text-xs text-muted-foreground">
            Artists
          </div>
        </div>
        <div>
          <div className="text-2xl font-semibold text-foreground mb-0.5">
            {stats.totalPlays.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">
            Plays
          </div>
        </div>
      </div>
    </div>
  );
}
