'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { EditArtistName } from './EditArtistName';
import { MessageArtistButton } from './MessageArtistButton';
import { FollowButton } from './FollowButton';
import { FollowersList } from './FollowersList';
import type { AIArtistDocument } from '@/types/firestore';

interface ArtistHeaderProps {
  artist: AIArtistDocument;
  timeAgo: string;
  isOwner?: boolean; // Optional, will be checked client-side if not provided
}

export function ArtistHeader({ artist, timeAgo, isOwner: propIsOwner }: ArtistHeaderProps) {
  const { user } = useAuth();
  const isOwner = propIsOwner ?? (user?.uid === artist.ownerId);

  return (
    <div className="flex-1">
      <div className="flex items-start justify-between mb-3">
        {isOwner ? (
          <EditArtistName artistId={artist.id} currentName={artist.name} />
        ) : (
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight">{artist.name}</h1>
        )}
        <div className="flex items-center gap-3">
          <MessageArtistButton artistId={artist.id} ownerId={artist.ownerId} />
          <FollowButton artistId={artist.id} ownerId={artist.ownerId} />
        </div>
      </div>
      <div className="flex items-center gap-4 mb-6">
        <p className="text-sm text-muted-foreground">Created {timeAgo}</p>
        <FollowersList artistId={artist.id} />
      </div>
      <p className="text-lg text-foreground/80 mb-8 leading-relaxed max-w-2xl">{artist.lore}</p>
    </div>
  );
}
