import type { Metadata } from 'next';
import { getPublicArtists } from '@/lib/services/artists';
import { getPublicSongs } from '@/lib/services/songs';
import { ArtistCard } from '@/components/artists/ArtistCard';
import { EmptyAction } from '@/components/states/EmptyAction';
import '@/components/artists/artist-card.css';
import { hasLaunchedCoin } from '@/lib/brand/coin';
import { fetchCoinQuotes } from '@/lib/solana/fetchCoinQuotes';
import type { SongDocument } from '@/types/firestore';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'All artists',
  description: 'Artists on Streamstar.',
};

export default async function ArtistsPage() {
  const [artists, songs] = await Promise.all([
    getPublicArtists(50),
    getPublicSongs(400),
  ]);

  const playableByArtist = new Map<string, SongDocument>();
  const trackCountByArtist = new Map<string, number>();
  songs.forEach(song => {
    if (!playableByArtist.has(song.artistId)) {
      playableByArtist.set(song.artistId, song);
    }
    trackCountByArtist.set(song.artistId, (trackCountByArtist.get(song.artistId) || 0) + 1);
  });

  const mintByArtist = new Map<string, string>();
  artists.forEach(artist => {
    const mint = artist.pumpFun?.mint?.trim();
    if (hasLaunchedCoin(artist.pumpFun) && mint) {
      mintByArtist.set(artist.id, mint);
    }
  });
  const quotes = await fetchCoinQuotes(Array.from(mintByArtist.values()));
  const coinByArtist = new Map<string, ArtistCoinQuote>();
  mintByArtist.forEach((mint, artistId) => {
    const quote = quotes.get(mint);
    if (quote) coinByArtist.set(artistId, quote);
  });

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <div className="flex items-center justify-between mb-12">
          <h1 className="listen-h1">All Artists</h1>
          {artists.length > 0 && (
            <span className="text-sm" style={{ color: 'var(--mute)' }}>
              {artists.length} {artists.length === 1 ? 'artist' : 'artists'}
            </span>
          )}
        </div>

        {artists.length > 0 ? (
          <div className="artist-index-grid">
            {artists.map(artist => (
              <ArtistCard
                key={artist.id}
                artist={artist}
                playable={playableByArtist.get(artist.id) || null}
                trackCount={trackCountByArtist.get(artist.id)}
                coin={coinByArtist.get(artist.id) || null}
              />
            ))}
          </div>
        ) : (
          <div className="p-12 border-2 border-dashed border-border rounded-xl text-center bg-muted/30">
            <EmptyAction message="No artists yet." href="/discover" label="Discover" />
          </div>
        )}
      </main>
    </div>
  );
}
