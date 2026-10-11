'use client';

import type { SongDocument } from '@/types/firestore';
import type { ArtistCardDisplay } from '@/lib/artists/cardDisplay';
import { SongCard } from '@/components/songs/SongCard';
import Link from 'next/link';

interface UserSongsSectionProps {
  songs: SongDocument[];
  songArtistMap: Map<string, string>;
  artistDisplays?: Map<string, ArtistCardDisplay>;
  /** Studio overview is the owner's catalog. Other callers leave this off. */
  ownerCatalog?: boolean;
  /** Overview already prints the section heading. */
  embedded?: boolean;
}

export function UserSongsSection({
  songs,
  songArtistMap,
  artistDisplays,
  ownerCatalog = false,
  embedded = false,
}: UserSongsSectionProps) {
  if (songs.length === 0) {
    return (
      <section className="mb-16">
        {embedded ? null : (
          <h2 className="text-xl font-semibold mb-6 text-foreground">Your Songs</h2>
        )}
        <div className="bg-card/50 border border-border/40 rounded-xl p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <h3 className="text-base font-medium text-foreground mb-1.5">No songs yet</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Start creating music with your AI artists
          </p>
          <Link
            href="/dashboard?tab=songs"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent-cta text-accent-ink hover:opacity-90 transition-opacity font-medium text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Your First Song
          </Link>
        </div>
      </section>
    );
  }

  const showViewAll = songs.length > 12;

  return (
    <section className={embedded ? undefined : 'mb-16'}>
      {!embedded || showViewAll ? (
        <div className="flex items-center justify-between mb-6">
          {embedded ? null : (
            <h2 className="text-xl font-semibold text-foreground">Your Songs</h2>
          )}
          {showViewAll ? (
            <Link
              href="/discover"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              View all
            </Link>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {songs.slice(0, 12).map(song => (
          <SongCard
            key={song.id}
            song={song}
            artistName={songArtistMap.get(song.id)}
            artist={artistDisplays?.get(song.artistId) ?? null}
            ownerCatalog={ownerCatalog}
          />
        ))}
      </div>
    </section>
  );
}
