import Link from 'next/link';
import Image from 'next/image';
import type { AIArtistDocument } from '@/types/firestore';
import { getAvatarGradient, getInitials } from '@/lib/utils/avatar';

interface ArtistCardProps {
  artist: AIArtistDocument;
}

export function ArtistCard({ artist }: ArtistCardProps) {
  return (
    <Link
      href={`/artists/${artist.id}`}
      className="block text-center group"
    >
      <div className="relative w-full aspect-square rounded-full overflow-hidden bg-muted mb-3 ring-2 ring-transparent group-hover:ring-accent/20 transition-all duration-300 group-hover:scale-105">
        {artist.avatarURL ? (
          <Image
            src={artist.avatarURL}
            alt={artist.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 80px, 120px"
          />
        ) : (
          <div 
            className="w-full h-full flex items-center justify-center relative"
            style={{ background: getAvatarGradient(artist.name) }}
          >
            {/* Subtle pattern overlay */}
            <div 
              className="absolute inset-0 opacity-10"
              style={{ 
                backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', 
                backgroundSize: '20px 20px' 
              }} 
            />
            {/* Initials */}
            <span className="relative text-white font-bold text-2xl lg:text-3xl drop-shadow-lg">
              {getInitials(artist.name)}
            </span>
          </div>
        )}
      </div>
      <h3 className="font-medium text-sm text-foreground group-hover:text-accent transition-colors line-clamp-1">
        {artist.name}
      </h3>
    </Link>
  );
}

