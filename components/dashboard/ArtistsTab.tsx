'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArtistCard } from '@/components/artists/ArtistCard';
import { CreateArtistCard } from '@/components/dashboard/CreateArtistCard';
import { CreativeArtistForm } from '@/components/dashboard/CreativeArtistForm';
import type { AIArtistDocument } from '@/types/firestore';

interface ArtistsTabProps {
  artists: AIArtistDocument[];
  onArtistCreated?: () => void;
}

export function ArtistsTab({ artists, onArtistCreated }: ArtistsTabProps) {
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
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-5">
          <CreateArtistCard onClick={() => setShowForm(true)} />
          {artists.map(artist => (
            <ArtistCard key={artist.id} artist={artist} />
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
