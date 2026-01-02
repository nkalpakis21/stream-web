'use client';

import { User } from 'firebase/auth';
import Link from 'next/link';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { LevelProgress } from '@/components/profile/LevelProgress';
import { Achievements } from '@/components/profile/Achievements';
import { ActivityChart } from '@/components/profile/ActivityChart';
import { PlaysChart } from '@/components/profile/PlaysChart';
import { UserArtistsSection } from '@/components/profile/UserArtistsSection';
import { UserSongsSection } from '@/components/profile/UserSongsSection';
import type { SongDocument, AIArtistDocument } from '@/types/firestore';

interface OverviewTabProps {
  user: User;
  stats: {
    songsCount: number;
    artistsCount: number;
    totalPlays: number;
  };
  songs: SongDocument[];
  artists: AIArtistDocument[];
  songArtistMap: Map<string, string>;
}

export function OverviewTab({
  user,
  stats,
  songs,
  artists,
  songArtistMap,
}: OverviewTabProps) {
  // Get recent items (last 3 songs, last 2 artists)
  const recentSongs = songs.slice(0, 3);
  const recentArtists = artists.slice(0, 2);

  return (
    <div className="space-y-8">
      {/* Profile Header */}
      <ProfileHeader user={user} stats={stats} />

      {/* Prominent CTAs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Link
          href="/dashboard?tab=songs"
          className="group relative overflow-hidden p-8 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent rounded-2xl border-2 border-accent/20 hover:border-accent/40 transition-all duration-300 hover:shadow-xl hover:scale-[1.02]"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-accent/80 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
              <svg className="w-8 h-8 text-accent-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-foreground mb-2">Create Song</h3>
              <p className="text-muted-foreground mb-3">Generate a new song with your AI artists</p>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-accent group-hover:gap-3 transition-all">
                Go to Songs
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </div>
        </Link>

        <Link
          href="/dashboard?tab=artists"
          className="group relative overflow-hidden p-8 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent rounded-2xl border-2 border-accent/20 hover:border-accent/40 transition-all duration-300 hover:shadow-xl hover:scale-[1.02]"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-accent/80 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
              <svg className="w-8 h-8 text-accent-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-foreground mb-2">Create Artist</h3>
              <p className="text-muted-foreground mb-3">Bring a new AI artist to life</p>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-accent group-hover:gap-3 transition-all">
                Go to Artists
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </div>
        </Link>
      </div>

      {/* Gamification Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LevelProgress
          songsCount={stats.songsCount}
          artistsCount={stats.artistsCount}
          totalPlays={stats.totalPlays}
        />
        <Achievements
          songsCount={stats.songsCount}
          artistsCount={stats.artistsCount}
          totalPlays={stats.totalPlays}
        />
      </div>

      {/* Charts Section */}
      {songs.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ActivityChart songs={songs} />
          <PlaysChart songs={songs} />
        </div>
      )}

      {/* Recent Artists */}
      {recentArtists.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold tracking-tight">Recent Artists</h2>
            <Link
              href="/dashboard?tab=artists"
              className="text-sm text-accent hover:opacity-80 transition-opacity"
            >
              View all →
            </Link>
          </div>
          <UserArtistsSection artists={recentArtists} />
        </div>
      )}

      {/* Recent Songs */}
      {recentSongs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold tracking-tight">Recent Songs</h2>
            <Link
              href="/dashboard?tab=songs"
              className="text-sm text-accent hover:opacity-80 transition-opacity"
            >
              View all →
            </Link>
          </div>
          <UserSongsSection songs={recentSongs} songArtistMap={songArtistMap} />
        </div>
      )}

      {/* Empty States */}
      {artists.length === 0 && songs.length === 0 && (
        <div className="text-center py-16">
          <div className="max-w-md mx-auto">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Get Started</h3>
            <p className="text-muted-foreground mb-6">
              Create your first AI artist and start making music
            </p>
            <Link
              href="/dashboard?tab=artists"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-accent to-accent/90 text-accent-foreground rounded-full hover:opacity-90 transition-opacity font-medium shadow-lg hover:shadow-xl"
            >
              Create Your First Artist
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

