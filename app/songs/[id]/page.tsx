import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import type { Metadata } from 'next';
import { getArtistCardContext } from '@/lib/server/artistDisplay';
import { formatDistanceToNow } from 'date-fns';
import {
  adminGetSong,
  adminGetSongGenerations,
  adminGetSongVersions,
} from '@/lib/server/songsAdmin';
import { verifiedViewerIdFromPage } from '@/lib/server/viewer';
import { hiddenSongPageMetadata, rejectHiddenSong } from '@/lib/songs/visibility';
import { toPlain, type Plain } from '@/lib/serialize/toPlain';
import { VersionCards } from '@/components/songs/VersionCards';
import { SongOwnerActions } from '@/components/songs/SongOwnerActions';
import { SITE_NAME, publicUrl, coverArtAlt, shareImageUrl, brandOgImageUrl } from '@/lib/brand/site';
import { coverFieldsFromSong, resolveCoverPoster } from '@/lib/covers/resolve';
import { ArtistCoinBuy } from '@/components/artists/ArtistCoinBuy';
import { LyricsSectionWrapper } from '@/components/lyrics/LyricsSectionWrapper';
import { SongStage } from '@/components/songs/SongStage';
import { SongStageSkeleton } from '@/components/songs/SongStageSkeleton';
import { getLyricsForSong } from '@/lib/services/lyrics';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { fetchCoinQuotes } from '@/lib/solana/fetchCoinQuotes';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import type { SongDocument, SongVersionDocument } from '@/types/firestore';

function primaryVersion(
  song: { currentVersionId?: string },
  versions: Array<{ id: string; audioURL?: string | null; isPrimary?: boolean }>
) {
  return (
    versions.find(version => version.isPrimary && version.audioURL) ||
    versions.find(version => version.id === song.currentVersionId && version.audioURL) ||
    versions.find(version => version.audioURL) ||
    versions.find(version => version.id === song.currentVersionId) ||
    versions[0]
  );
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface SongPageProps {
  params: {
    id: string;
  };
}

export async function generateMetadata({ params }: SongPageProps): Promise<Metadata> {
  noStore();
  const [viewerId, song] = await Promise.all([
    verifiedViewerIdFromPage(),
    adminGetSong(params.id),
  ]);
  rejectHiddenSong(song, viewerId);
  // The owner can open a private song. The title still stays out of the tags.
  if (song.isPublic !== true) {
    return hiddenSongPageMetadata();
  }

  const artistContext = await getArtistCardContext([song.artistId]);
  const artist = artistContext.displays.get(song.artistId) ?? null;

  const ogImageUrl = shareImageUrl(resolveCoverPoster(song));
  const usingBrandOg = ogImageUrl === brandOgImageUrl();

  const title = song.title;
  const artistName = artist?.name || 'Unknown Artist';
  const description = `Listen to ${title} by ${artistName} on Streamstar`;
  const pageUrl = publicUrl(`/songs/${params.id}`);
  const cardDescription = `by ${artistName}`;

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title,
      description: cardDescription,
      type: 'music.song',
      url: pageUrl,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: usingBrandOg ? 630 : 1200,
          alt: usingBrandOg ? SITE_NAME : coverArtAlt(title),
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: cardDescription,
      images: [ogImageUrl],
    },
  };
}

async function SongPageBody({
  song,
  allVersions,
}: {
  song: Plain<SongDocument>;
  allVersions: Plain<SongVersionDocument>[];
}) {
  const [artistContext, generations] = await Promise.all([
    getArtistCardContext([song.artistId]),
    adminGetSongGenerations(song.id),
  ]);
  const artist = artistContext.displays.get(song.artistId) ?? null;
  const coinHint = artistContext.coins.get(song.artistId);
  const primaryWithAudio = primaryVersion(song, allVersions);

  const hasPendingGeneration = generations.some(
    generation => generation.status === 'pending' || generation.status === 'processing'
  );
  const createdAt = typeof song.createdAt === 'number' ? song.createdAt : 0;
  const timeAgo = formatDistanceToNow(createdAt, { addSuffix: true });

  const coverImageUrl = resolveCoverPoster(song);
  const cover = coverFieldsFromSong(song);
  const primaryAudioUrl = primaryWithAudio?.audioURL || null;
  const lyrics = getLyricsForSong(generations);

  const mint = coinHint?.mint?.trim() || '';
  const quotes = mint ? await fetchCoinQuotes([mint]) : new Map<string, ArtistCoinQuote>();
  const coin = mint ? quotes.get(mint) ?? null : null;
  const buyUrl = coinHint?.buyUrl ?? null;
  const shareUrl = publicUrl(`/songs/${song.id}`);
  const artistLinkable = artist?.isPublic === true;

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <SongStage
          songId={song.id}
          songTitle={song.title}
          artistId={song.artistId}
          artistLinkable={artistLinkable}
          artistPhotoUrl={artist?.photoUrl ?? null}
          artistName={artist?.name || 'Unknown Artist'}
          albumCoverUrl={coverImageUrl}
          cover={cover}
          audioUrl={primaryAudioUrl}
          pending={hasPendingGeneration}
          durationSeconds={song.duration ?? null}
          ticker={coinHint?.ticker}
          coinIcon={coinHint?.coinIcon}
          coin={coin}
          buyUrl={buyUrl}
          shareUrl={shareUrl}
          versions={allVersions.map(version => ({
            id: version.id,
            audioURL: version.audioURL,
            isPrimary: version.isPrimary,
            duration: song.duration ?? null,
          }))}
        >
          {lyrics && (
            <div className="mt-8">
              <LyricsSectionWrapper
                lyrics={lyrics}
                songTitle={song.title}
                artistName={artist?.name || 'Unknown Artist'}
                albumCoverUrl={coverImageUrl}
                audioUrl={primaryAudioUrl}
              />
            </div>
          )}
        </SongStage>
        <div className="mt-6 mb-10 flex flex-col items-start gap-3">
          <SongOwnerActions songId={song.id} songTitle={song.title} ownerId={song.ownerId} />
          <ArtistCoinBuy url={buyUrl} />
          <p className="text-xs sm:text-sm text-muted-foreground mt-2 sm:mt-3">
            Created {timeAgo}
          </p>
        </div>

        <VersionCards
          songTitle={song.title}
          artistName={artist?.name || 'Unknown Artist'}
          artistId={artist?.id}
          albumCoverUrl={coverImageUrl}
          initialVersions={allVersions}
          hasPendingGeneration={hasPendingGeneration}
          songId={song.id}
          ownerId={song.ownerId}
        />

        <CommentsSection targetType="song" targetId={song.id} />
      </main>
    </div>
  );
}

export default async function SongPage({ params }: SongPageProps) {
  noStore();
  const [viewerId, song] = await Promise.all([
    verifiedViewerIdFromPage(),
    adminGetSong(params.id),
  ]);
  rejectHiddenSong(song, viewerId);

  const allVersions = await adminGetSongVersions(song.id);
  if (!primaryVersion(song, allVersions)) {
    notFound();
  }

  return (
    <Suspense fallback={<SongStageSkeleton />}>
      <SongPageBody song={toPlain(song)} allVersions={toPlain(allVersions)} />
    </Suspense>
  );
}
