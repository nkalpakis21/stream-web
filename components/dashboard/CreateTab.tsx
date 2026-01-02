'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CreateArtistForm } from '@/components/artists/CreateArtistForm';
import { CreateSongForm } from '@/components/songs/CreateSongForm';
import { ProgressIndicator } from '@/components/create/ProgressIndicator';
import type { AIArtistDocument } from '@/types/firestore';

interface CreateTabProps {
  artists: AIArtistDocument[];
  preselectedArtistId?: string;
  showSuccessMessage?: boolean;
}

export function CreateTab({ artists, preselectedArtistId, showSuccessMessage }: CreateTabProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const action = searchParams.get('action') as 'artist' | 'song' | null;
  
  // Determine which form to show
  const [activeForm, setActiveForm] = useState<'artist' | 'song'>(
    action || (artists.length === 0 ? 'artist' : 'song')
  );

  useEffect(() => {
    if (action) {
      setActiveForm(action);
    } else if (artists.length === 0) {
      setActiveForm('artist');
    } else {
      setActiveForm('song');
    }
  }, [action, artists.length]);

  // Update URL when form changes internally
  const handleFormChange = (form: 'artist' | 'song') => {
    setActiveForm(form);
    router.push(`/dashboard?tab=create&action=${form}`);
  };

  const handleArtistSuccess = (artistId: string) => {
    // Switch to song form and pre-select the new artist
    setActiveForm('song');
    router.push(`/dashboard?tab=create&action=song&artistId=${artistId}`);
  };

  const handleSongSuccess = () => {
    // Song form handles its own redirect
  };

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      {artists.length === 0 && (
        <ProgressIndicator
          currentStep={activeForm}
          artistCreated={!!preselectedArtistId}
          hasArtists={artists.length > 0}
        />
      )}

      {/* Form Selection Tabs (if user has artists) */}
      {artists.length > 0 && (
        <div className="flex gap-2 border-b border-border">
          <button
            onClick={() => handleFormChange('artist')}
            className={`px-6 py-3 text-sm font-medium transition-all duration-200 relative ${
              activeForm === 'artist'
                ? 'text-accent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Create Artist
            {activeForm === 'artist' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t-full" />
            )}
          </button>
          <button
            onClick={() => handleFormChange('song')}
            className={`px-6 py-3 text-sm font-medium transition-all duration-200 relative ${
              activeForm === 'song'
                ? 'text-accent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Create Song
            {activeForm === 'song' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t-full" />
            )}
          </button>
        </div>
      )}

      {/* Forms */}
      <div className="bg-card rounded-2xl p-6 sm:p-8 lg:p-10 shadow-soft border border-border">
        {activeForm === 'artist' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Create AI Artist</h2>
            <CreateArtistForm onSuccess={handleArtistSuccess} />
          </div>
        )}
        {activeForm === 'song' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Create Song</h2>
            <CreateSongForm
              preselectedArtistId={preselectedArtistId}
              showSuccessMessage={showSuccessMessage}
            />
          </div>
        )}
      </div>
    </div>
  );
}

