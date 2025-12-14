import Link from 'next/link';
import type { AIArtistDocument } from '@/types/firestore';

interface ArtistCardProps {
  artist: AIArtistDocument;
}

export function ArtistCard({ artist }: ArtistCardProps) {
  return (
    <Link
      href={`/artists/${artist.id}`}
      className="block text-center group"
    >
      <div className="w-full aspect-square rounded-full overflow-hidden bg-gray-200 dark:bg-gray-800 mb-2 group-hover:opacity-80 transition-opacity">
        {artist.avatarURL ? (
          <img
            src={artist.avatarURL}
            alt={artist.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">
            {artist.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <h3 className="font-medium text-sm">{artist.name}</h3>
    </Link>
  );
}

