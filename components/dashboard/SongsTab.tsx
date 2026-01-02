'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SongCard } from '@/components/songs/SongCard';
import { CreateSongCard } from '@/components/dashboard/CreateSongCard';
import { CreativeSongForm } from '@/components/dashboard/CreativeSongForm';
import type { SongDocument } from '@/types/firestore';

interface SongsTabProps {
  songs: SongDocument[];
  songArtistMap: Map<string, string>;
  preselectedArtistId?: string;
  onSongCreated?: () => void;
}

export function SongsTab({ songs, songArtistMap, preselectedArtistId, onSongCreated }: SongsTabProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(!!preselectedArtistId);

  const handleSuccess = () => {
    setShowForm(false);
    if (onSongCreated) {
      onSongCreated();
    }
    router.refresh();
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">Your Songs</h2>
        <p className="text-muted-foreground">
          Manage your songs and create new ones
        </p>
      </div>

      {/* Creative Form */}
      {showForm && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300">
          <CreativeSongForm
            preselectedArtistId={preselectedArtistId}
            onSuccess={handleSuccess}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Songs Grid */}
      {!showForm && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          <CreateSongCard onClick={() => setShowForm(true)} />
          {songs.map(song => (
            <SongCard 
              key={song.id} 
              song={song} 
              artistName={songArtistMap.get(song.id)}
            />
          ))}
        </div>
      )}

      {/* Empty State (only shown if no songs and form is not showing) */}
      {songs.length === 0 && !showForm && (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <div className="max-w-md mx-auto">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">No songs yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first song with one of your AI artists
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
