'use client';

import Link from 'next/link';
import { UserArtistsSection } from '@/components/profile/UserArtistsSection';
import { UserSongsSection } from '@/components/profile/UserSongsSection';
import type { SongDocument, AIArtistDocument } from '@/types/firestore';

interface OverviewTabProps {
  songs: SongDocument[];
  artists: AIArtistDocument[];
  songArtistMap: Map<string, string>;
}

export function OverviewTab({
  songs,
  artists,
  songArtistMap,
}: OverviewTabProps) {
  const recentSongs = songs.slice(0, 3);
  const recentArtists = artists.slice(0, 2);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Link
          href="/dashboard?tab=artists&new=1"
          className="group rounded-2xl border border-white/10 bg-card/60 p-6 sm:p-8 hover:border-primary/40 transition-colors"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Create</p>
          <h3 className="mt-2 text-xl font-bold text-foreground">Artist</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Photo first. Name, lore, voice. Coin optional.
          </p>
          <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
            Open
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </Link>

        <Link
          href="/dashboard?tab=songs&new=1"
          className="group rounded-2xl border border-white/10 bg-card/60 p-6 sm:p-8 hover:border-primary/40 transition-colors"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Generate</p>
          <h3 className="mt-2 text-xl font-bold text-foreground">Song</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick an artist, title, prompt. One generation.
          </p>
          <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
            Open
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </Link>
      </div>

      {recentArtists.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold tracking-tight">Your artists</h2>
            <Link
              href="/dashboard?tab=artists"
              className="text-sm text-primary hover:opacity-80 transition-opacity"
            >
              View all →
            </Link>
          </div>
          <UserArtistsSection artists={recentArtists} />
        </div>
      )}

      {recentSongs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold tracking-tight">Your songs</h2>
            <Link
              href="/dashboard?tab=songs"
              className="text-sm text-primary hover:opacity-80 transition-opacity"
            >
              View all →
            </Link>
          </div>
          <UserSongsSection songs={recentSongs} songArtistMap={songArtistMap} />
        </div>
      )}

      {artists.length === 0 && songs.length === 0 && (
        <div className="text-center py-16 rounded-2xl border border-white/10 bg-card/40">
          <div className="max-w-md mx-auto">
            <h3 className="text-xl font-semibold mb-2">Studio is the second door</h3>
            <p className="text-muted-foreground mb-6">
              Listeners stay on Discover. Create an artist here, then generate a song.
            </p>
            <Link
              href="/dashboard?tab=artists&new=1"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full hover:opacity-90 transition-opacity font-medium"
            >
              Create your first artist
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
