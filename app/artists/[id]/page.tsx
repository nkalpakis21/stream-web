import { notFound } from 'next/navigation';
import { getArtist } from '@/lib/services/artists';
import { getArtistSongs } from '@/lib/services/songs';
import { SongCard } from '@/components/songs/SongCard';
import { ArtistHero } from '@/components/artists/ArtistHero';
import { hasLaunchedCoin } from '@/lib/brand/coin';
import { fetchArtistCoinModule } from '@/lib/solana/fetchArtistCoinModule';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { EmptyAction } from '@/components/states/EmptyAction';

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

  const [songs, coin] = await Promise.all([
    getArtistSongs(artist.id, 20),
    fetchArtistCoinModule(artist.pumpFun?.mint),
  ]);

  const style = artist.styleDNA;
  const hasStyle =
    style.genres.length > 0 ||
    style.moods.length > 0 ||
    style.influences.length > 0 ||
    Boolean(artist.vocalIdentity);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <ArtistHero artist={artist} coin={coin}>
          {hasStyle ? (
            <div className="mb-12 grid grid-cols-1 gap-4 border-t border-border pt-6 sm:grid-cols-2">
              {style.genres.length > 0 && (
                <div>
                  <span className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                    Genres
                  </span>
                  <p className="text-sm font-medium">{style.genres.join(', ')}</p>
                </div>
              )}
              {style.moods.length > 0 && (
                <div>
                  <span className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                    Moods
                  </span>
                  <p className="text-sm font-medium">{style.moods.join(', ')}</p>
                </div>
              )}
              {style.influences.length > 0 && (
                <div>
                  <span className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                    Influences
                  </span>
                  <p className="text-sm font-medium">{style.influences.join(', ')}</p>
                </div>
              )}
              {artist.vocalIdentity ? (
                <div>
                  <span className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                    Vocal identity
                  </span>
                  <p className="text-sm font-medium">{artist.vocalIdentity}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </ArtistHero>

        <section>
          <div className="mb-8 flex items-center justify-between">
            <h2 className="listen-title">Songs</h2>
            {songs.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {songs.length} {songs.length === 1 ? 'song' : 'songs'}
              </span>
            )}
          </div>
          {songs.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {songs.map(song => (
                <SongCard
                  key={song.id}
                  song={song}
                  artistName={artist.name}
                  hasCoin={hasLaunchedCoin(artist.pumpFun)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-12 text-center">
              <EmptyAction message="No songs yet." href="/discover" label="Discover" />
            </div>
          )}
        </section>

        <CommentsSection targetType="artist" targetId={artist.id} />
      </main>
    </div>
  );
}
