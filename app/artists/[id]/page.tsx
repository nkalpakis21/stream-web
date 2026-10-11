import { Suspense } from 'react';
import { unstable_noStore as noStore } from 'next/cache';
import type { Metadata } from 'next';
import { artistShareMetadata, hiddenArtistPageMetadata } from '@/lib/artists/visibility';
import { rejectHiddenArtist } from '@/lib/artists/pageGate';
import { artistPageClientProps } from '@/lib/artists/pageProps';
import { artistHeroFaceSources } from '@/lib/images/artistFace';
import { ClearOwnerRecovery } from '@/components/states/ClearOwnerRecovery';
import { isArtistOwner, selectArtistPageSongs } from '@/lib/artists/ownerSongs';
import { adminGetArtist } from '@/lib/server/artistsAdmin';
import { adminCountFollowers } from '@/lib/server/followsCount';
import { isXConfigured } from '@/lib/x/config';
import { adminListOwnerArtistSongs } from '@/lib/server/songsAdmin';
import { getArtistCardContext } from '@/lib/server/artistDisplay';
import { verifiedViewerIdFromPage } from '@/lib/server/viewer';
import { SITE_NAME, publicUrl, isDefaultTempoRange, shareImageUrl, brandOgImageUrl } from '@/lib/brand/site';
import { getArtistSongs } from '@/lib/services/songs';
import { SongCard } from '@/components/songs/SongCard';
import { ArtistHero } from '@/components/artists/ArtistHero';
import { coinBadgeFromArtist, hasLaunchedCoin } from '@/lib/brand/coin';
import { ArtistPageSkeleton } from '@/components/artists/ArtistPageSkeleton';
import type { AIArtistDocument } from '@/types/firestore';
import { fetchArtistCoinModule } from '@/lib/solana/fetchArtistCoinModule';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { EmptyAction } from '@/components/states/EmptyAction';
import { OwnerSongListRecovery } from '@/app/artists/[id]/OwnerSongListRecovery';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface ArtistPageProps {
  params: {
    id: string;
  };
}

export async function generateMetadata({ params }: ArtistPageProps): Promise<Metadata> {
  noStore();
  const artist = await adminGetArtist(params.id);
  const pageUrl = publicUrl(`/artists/${params.id}`);
  const share = artistShareMetadata(artist, pageUrl);
  if (!share.description) {
    return hiddenArtistPageMetadata();
  }
  const ogImageUrl = share.image ? shareImageUrl(share.image) : brandOgImageUrl();
  const usingBrandOg = ogImageUrl === brandOgImageUrl();
  const title = share.title;
  const description = share.description;
  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title,
      description,
      type: 'profile',
      url: pageUrl,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: usingBrandOg ? 630 : 1200,
          alt: usingBrandOg ? SITE_NAME : `${share.title} cover art`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

async function ArtistPageBody({
  artist,
  viewerId,
}: {
  artist: AIArtistDocument;
  viewerId: string | null;
}) {
  const ownerView = isArtistOwner(viewerId, artist.ownerId);
  const [fetchedSongs, coin, cards, followerCount] = await Promise.all([
    ownerView
      ? adminListOwnerArtistSongs(artist.id, artist.ownerId)
      : getArtistSongs(artist.id, 20),
    fetchArtistCoinModule(artist.pumpFun?.mint),
    getArtistCardContext([artist.id]),
    adminCountFollowers(artist.id),
  ]);
  const songs = selectArtistPageSongs(
    fetchedSongs,
    ownerView ? viewerId : null,
    artist.ownerId,
    artist.id
  );

  const faceSongs = songs.filter(song => song.isPublic === true);
  const faceSources = artistHeroFaceSources({
    lockedLookUrl: cards.displays.get(artist.id)?.photoUrl ?? null,
    avatarURL: artist.avatarURL,
    songs: faceSongs.length > 0 ? faceSongs : ownerView ? songs : [],
  });
  const clientProps = artistPageClientProps({
    artist,
    songs,
    coin,
    faceSources,
    followerCount,
  });
  const view = clientProps.artist;
  const coinBadge = coinBadgeFromArtist(view);
  const style = view.styleDNA;
  const showTempo = !isDefaultTempoRange(style.tempoRange);
  const hasStyle =
    style.genres.length > 0 ||
    style.moods.length > 0 ||
    style.influences.length > 0 ||
    Boolean(view.vocalIdentity) ||
    showTempo;

  return (
    <div className="min-h-screen bg-background">
      <ClearOwnerRecovery kind="artist" id={artist.id} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <ArtistHero
          artist={view}
          coin={clientProps.coin}
          faceSources={clientProps.faceSources}
          followerCount={clientProps.followerCount}
          xConfigured={isXConfigured()}
        >
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
              {view.vocalIdentity ? (
                <div>
                  <span className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                    Vocal identity
                  </span>
                  <p className="text-sm font-medium">{view.vocalIdentity}</p>
                </div>
              ) : null}
              {showTempo ? (
                <div>
                  <span className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                    Tempo range
                  </span>
                  <p className="text-sm font-medium">
                    {style.tempoRange.min}–{style.tempoRange.max}
                  </p>
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
              {clientProps.songs.map(song => (
                <SongCard
                  key={song.id}
                  song={song}
                  artistName={view.name}
                  ticker={coinBadge?.ticker}
                  coinIcon={coinBadge?.iconSrc}
                  ownerCatalog={ownerView}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-12 text-center">
              <EmptyAction message="No songs yet." href="/discover" label="Discover" />
            </div>
          )}
        </section>

        <OwnerSongListRecovery artistId={view.id} ownerId={view.ownerId} included={ownerView} />
        <CommentsSection targetType="artist" targetId={view.id} />
      </main>
    </div>
  );
}

export default async function ArtistPage({ params }: ArtistPageProps) {
  noStore();
  const [viewerId, artist] = await Promise.all([
    verifiedViewerIdFromPage(),
    adminGetArtist(params.id),
  ]);

  // notFound() runs before any Suspense fallback is flushed, so the status
  // stays 404. Slow songs and the coin quote stream inside the shell.
  rejectHiddenArtist(artist, viewerId);

  return (
    <Suspense fallback={<ArtistPageSkeleton showCoin={hasLaunchedCoin(artist.pumpFun)} />}>
      <ArtistPageBody artist={artist} viewerId={viewerId} />
    </Suspense>
  );
}
