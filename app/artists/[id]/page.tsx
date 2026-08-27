import { notFound } from 'next/navigation';
import { getArtist } from '@/lib/services/artists';
import { getArtistSongs } from '@/lib/services/songs';
import { SongCard } from '@/components/songs/SongCard';
import { V0Navbar } from '@/components/navigation/V0Navbar';
import { ArtistHero } from '@/components/artists/ArtistHero';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { formatDistanceToNow } from 'date-fns';

// Force dynamic rendering to always fetch fresh data from Firestore
export const dynamic = 'force-dynamic';

interface ArtistPageProps {
  params: {
    id: string;
  };
}

export default async function ArtistPage({ params }: ArtistPageProps) {
  const artist = await getArtist(params.id);

  if (!artist || artist.deletedAt) {
    notFound();
  }

  // Check if artist is public or user has access
  // TODO: Add auth check for private artists

  const songs = await getArtistSongs(artist.id, 20);
  const timeAgo = formatDistanceToNow(artist.createdAt.toDate(), {
    addSuffix: true,
  });

  return (
    <div className="min-h-screen bg-background">
      <V0Navbar />

      <main className="max-w-7xl mx-auto px-6 lg:px-8 pt-20 pb-8 lg:pt-24 lg:pb-12">
        {/* Artist Header — look picker is owner/manager only (client-side) */}
        <ArtistHero artist={artist} timeAgo={timeAgo}>
          {/* Style DNA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 border-t border-border">
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">Genres</span>
              <p className="text-sm font-medium">
                {artist.styleDNA.genres.length > 0 ? artist.styleDNA.genres.join(', ') : 'None'}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">Moods</span>
              <p className="text-sm font-medium">
                {artist.styleDNA.moods.length > 0 ? artist.styleDNA.moods.join(', ') : 'None'}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">Tempo Range</span>
              <p className="text-sm font-medium">
                {artist.styleDNA.tempoRange.min} - {artist.styleDNA.tempoRange.max} BPM
              </p>
            </div>
            {artist.styleDNA.influences.length > 0 && (
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">Influences</span>
                <p className="text-sm font-medium">{artist.styleDNA.influences.join(', ')}</p>
              </div>
            )}
            {artist.vocalIdentity && (
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">Vocal identity</span>
                <p className="text-sm font-medium">{artist.vocalIdentity}</p>
              </div>
            )}
          </div>
        </ArtistHero>

        {/* Songs Section */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold tracking-tight">Songs</h2>
            {songs.length > 0 && (
              <span className="text-sm text-muted-foreground">{songs.length} {songs.length === 1 ? 'song' : 'songs'}</span>
            )}
          </div>
          {songs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {songs.map(song => (
                <SongCard key={song.id} song={song} artistName={artist.name} />
              ))}
            </div>
          ) : (
            <div className="p-12 border-2 border-dashed border-border rounded-2xl text-center bg-muted/30">
              <p className="text-muted-foreground">No songs yet.</p>
            </div>
          )}
        </section>

        {/* Comments Section */}
        <CommentsSection targetType="artist" targetId={artist.id} />
      </main>
    </div>
  );
}

