'use client';

import Link from 'next/link';
import { StudioCreateCards } from '@/components/dashboard/StudioCreateCards';
import { UserArtistsSection } from '@/components/profile/UserArtistsSection';
import { UserSongsSection } from '@/components/profile/UserSongsSection';
import type { ArtistCardDisplay } from '@/lib/artists/cardDisplay';
import type { SongDocument, AIArtistDocument } from '@/types/firestore';

interface OverviewTabProps {
  songs: SongDocument[];
  artists: AIArtistDocument[];
  songArtistMap: Map<string, string>;
  artistDisplays: Map<string, ArtistCardDisplay>;
}

export function OverviewTab({
  songs,
  artists,
  songArtistMap,
  artistDisplays,
}: OverviewTabProps) {
  const recentSongs = songs.slice(0, 3);
  const recentArtists = artists.slice(0, 2);

  return (
    <div className="space-y-8">
      <StudioCreateCards />

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
          <UserArtistsSection
            artists={recentArtists}
            songs={songs}
            displays={artistDisplays}
            embedded
          />
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
          <UserSongsSection
            songs={recentSongs}
            songArtistMap={songArtistMap}
            artistDisplays={artistDisplays}
            ownerCatalog
            embedded
          />
        </div>
      )}

      {artists.length === 0 && songs.length === 0 && (
        <div className="text-center py-16 rounded-xl border border-white/10 bg-card/40">
          <div className="max-w-md mx-auto">
            <Link
              href="/dashboard?tab=artists&new=1"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent-cta text-accent-ink rounded-xl hover:opacity-90 transition-opacity font-medium"
            >
              Create your first artist
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
