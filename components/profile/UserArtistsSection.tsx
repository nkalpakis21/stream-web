'use client';

import type { AIArtistDocument } from '@/types/firestore';
import { ArtistCard } from '@/components/artists/ArtistCard';
import Link from 'next/link';

interface UserArtistsSectionProps {
  artists: AIArtistDocument[];
}

export function UserArtistsSection({ artists }: UserArtistsSectionProps) {
  if (artists.length === 0) {
    return (
      <section className="mb-16">
        <h2 className="text-xl font-semibold mb-6 text-foreground">Your Artists</h2>
        <div className="bg-card/50 border border-border/40 rounded-xl p-16 text-center">
          <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h3 className="text-base font-medium text-foreground mb-1.5">No artists yet</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Create your first AI artist to start making music
          </p>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-opacity font-medium text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Your First Artist
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-16">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-foreground">Your Artists</h2>
        {artists.length > 8 && (
          <Link
            href="/artists"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
          </Link>
        )}
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-5">
        {artists.slice(0, 8).map(artist => (
          <ArtistCard key={artist.id} artist={artist} />
        ))}
      </div>
    </section>
  );
}
