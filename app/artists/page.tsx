import { getPublicArtists } from '@/lib/services/artists';
import { ArtistCard } from '@/components/artists/ArtistCard';
import { Nav } from '@/components/navigation/Nav';

// Force dynamic rendering to always fetch fresh data from Firestore
export const dynamic = 'force-dynamic';

export default async function ArtistsPage() {
  const artists = await getPublicArtists(50);

  return (
    <div className="min-h-screen bg-background">
      <Nav />

      <main className="max-w-7xl mx-auto px-6 lg:px-8 py-8 lg:py-12">
        <div className="flex items-center justify-between mb-12">
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight">All Artists</h1>
          {artists.length > 0 && (
            <span className="text-sm text-muted-foreground">{artists.length} {artists.length === 1 ? 'artist' : 'artists'}</span>
          )}
        </div>

        {artists.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6">
            {artists.map(artist => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </div>
        ) : (
          <div className="p-12 border-2 border-dashed border-border rounded-2xl text-center bg-muted/30">
            <p className="text-muted-foreground text-lg">No artists yet. Create your first AI artist!</p>
          </div>
        )}
      </main>
    </div>
  );
}
