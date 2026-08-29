'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();
  const [showForm, setShowForm] = useState(
    Boolean(preselectedArtistId) || searchParams.get('new') === '1'
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">Generate song</h2>
        <p className="text-muted-foreground">
          Pick an artist, add a title and prompt. The result is the player.
        </p>
      </div>

      {showForm && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300">
          <CreativeSongForm
            preselectedArtistId={preselectedArtistId}
            onSuccess={() => onSongCreated?.()}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

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

      {songs.length === 0 && !showForm && (
        <div className="text-center py-16 bg-card/60 rounded-xl border border-white/10">
          <div className="max-w-md mx-auto">
            <h3 className="text-xl font-semibold mb-2">No songs yet</h3>
            <p className="text-muted-foreground">
              Generate one track with an artist you own.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
