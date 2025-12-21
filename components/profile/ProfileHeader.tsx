'use client';

import { User } from 'firebase/auth';
import Link from 'next/link';

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
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 mb-10">
        {/* User Info */}
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-2 text-foreground">
            {displayName}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {user.email}
          </p>
        </div>

        {/* Action Button */}
        <div className="w-full sm:w-auto">
          <Link
            href="/create"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-accent-foreground hover:opacity-90 active:opacity-80 transition-all duration-200 font-medium text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create
          </Link>
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
