'use client';

import { Suspense } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { EditArtistName } from './EditArtistName';
import { MessageArtistButton } from './MessageArtistButton';
import { FollowButton } from './FollowButton';
import { FollowersList } from './FollowersList';
import { ArtistXPanel } from './ArtistXPanel';
import { isHonestBio } from '@/lib/brand/bio';
import type { AIArtistDocument } from '@/types/firestore';

interface ArtistHeaderProps {
  artist: AIArtistDocument;
  isOwner?: boolean;
}

export function ArtistHeader({ artist, isOwner: propIsOwner }: ArtistHeaderProps) {
  const { user } = useAuth();
  const isOwner = propIsOwner ?? (user?.uid === artist.ownerId);
  const bio = isHonestBio(artist.lore, artist.name) ? artist.lore.trim() : null;

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-4 mb-3">
        {isOwner ? (
          <EditArtistName artistId={artist.id} currentName={artist.name} />
        ) : (
          <h1 className="listen-h1" data-entity="artist">
            {artist.name}
          </h1>
        )}
      </div>
      <FollowersList artistId={artist.id} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <FollowButton artistId={artist.id} ownerId={artist.ownerId} />
        <MessageArtistButton artistId={artist.id} ownerId={artist.ownerId} />
      </div>
      {bio ? (
        <p className="mt-6 text-base leading-relaxed text-[color:var(--ink)]/80 max-w-2xl">
          {bio}
        </p>
      ) : null}
      <Suspense fallback={null}>
        <ArtistXPanel artistId={artist.id} ownerId={artist.ownerId} />
      </Suspense>
    </div>
  );
}
