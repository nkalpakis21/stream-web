'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArtistCard } from '@/components/artists/ArtistCard';
import { CreateArtistCard } from '@/components/dashboard/CreateArtistCard';
import { CreativeArtistForm } from '@/components/dashboard/CreativeArtistForm';
import type { AIArtistDocument } from '@/types/firestore';

interface ArtistsTabProps {
  artists: AIArtistDocument[];
  onArtistCreated?: () => void;
}

export function ArtistsTab({ artists, onArtistCreated }: ArtistsTabProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);

  const handleSuccess = (artistId: string) => {
    setShowForm(false);
    if (onArtistCreated) {
      onArtistCreated();
    }
    router.refresh();
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">Your Artists</h2>
        <p className="text-muted-foreground">
          Manage your AI artists and create new ones
        </p>
      </div>

      {/* Creative Form */}
      {showForm && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300">
          <CreativeArtistForm
            onSuccess={handleSuccess}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Artists Grid */}
      {!showForm && (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-5">
          <CreateArtistCard onClick={() => setShowForm(true)} />
          {artists.map(artist => (
            <ArtistCard key={artist.id} artist={artist} />
          ))}
        </div>
      )}

      {/* Empty State (only shown if no artists and form is not showing) */}
      {artists.length === 0 && !showForm && (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <div className="max-w-md mx-auto">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">No artists yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first AI artist to start making music
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
