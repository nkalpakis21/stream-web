import { CreateArtistCard } from '@/components/dashboard/CreateArtistCard';
import { StudioArtistTile } from '@/components/dashboard/StudioArtistTile';
import type { ArtistCardDisplay } from '@/lib/artists/cardDisplay';
import type { AIArtistDocument, SongDocument } from '@/types/firestore';

interface ArtistsTabProps {
  artists: AIArtistDocument[];
  songs?: readonly SongDocument[];
  displays?: Map<string, ArtistCardDisplay>;
}

export function ArtistsTab({ artists, songs = [], displays }: ArtistsTabProps) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">Your artists</h2>
        <p className="text-muted-foreground">
          A new artist and their first song start on one screen.
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-5">
        <CreateArtistCard />
        {artists.map(artist => (
          <StudioArtistTile
            key={artist.id}
            artist={artist}
            photoUrl={displays?.get(artist.id)?.photoUrl ?? null}
            songs={songs.filter(song => song.artistId === artist.id && !song.deletedAt)}
          />
        ))}
      </div>

      {artists.length === 0 && (
        <div className="text-center py-16 bg-card/60 rounded-xl border border-white/10">
          <div className="max-w-md mx-auto">
            <h3 className="text-xl font-semibold mb-2">No artists yet</h3>
            <p className="text-muted-foreground">
              Start with a name and a first song. A face is optional.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
