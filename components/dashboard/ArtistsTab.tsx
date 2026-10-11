'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CreateArtistCard } from '@/components/dashboard/CreateArtistCard';
import { StudioArtistTile } from '@/components/dashboard/StudioArtistTile';
import { CreativeArtistForm } from '@/components/dashboard/CreativeArtistForm';
import type { ArtistCardDisplay } from '@/lib/artists/cardDisplay';
import type { AIArtistDocument, SongDocument } from '@/types/firestore';

interface ArtistsTabProps {
  artists: AIArtistDocument[];
  songs?: readonly SongDocument[];
  displays?: Map<string, ArtistCardDisplay>;
  onArtistCreated?: () => void;
}

export function ArtistsTab({
  artists,
  songs = [],
  displays,
  onArtistCreated,
}: ArtistsTabProps) {
  const searchParams = useSearchParams();
  const [showForm, setShowForm] = useState(searchParams.get('new') === '1');

  const handleSuccess = () => {
    setShowForm(false);
    onArtistCreated?.();
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">Create artist</h2>
        <p className="text-muted-foreground">
          Photo first. Name, lore, voice. Coin and X stay optional.
        </p>
      </div>

      {showForm && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300">
          <CreativeArtistForm
            onSuccess={handleSuccess}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {!showForm && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-5">
          <CreateArtistCard onClick={() => setShowForm(true)} />
          {artists.map(artist => (
            <StudioArtistTile
              key={artist.id}
              artist={artist}
              photoUrl={displays?.get(artist.id)?.photoUrl ?? null}
              songs={songs.filter(song => song.artistId === artist.id && !song.deletedAt)}
            />
          ))}
        </div>
      )}

      {artists.length === 0 && !showForm && (
        <div className="text-center py-16 bg-card/60 rounded-xl border border-white/10">
          <div className="max-w-md mx-auto">
            <h3 className="text-xl font-semibold mb-2">No artists yet</h3>
            <p className="text-muted-foreground">
              Start with a photo, then name, lore, and voice.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
