import Link from 'next/link';
import type { AIArtistDocument, SongDocument } from '@/types/firestore';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import { PlayableArt } from '@/components/songs/PlayableArt';
import { CoverImage } from '@/components/media/CoverImage';
import { DiscoverCoinRow } from '@/components/discover/DiscoverCoinRow';

interface ArtistCardProps {
  artist: AIArtistDocument;
  playable?: SongDocument | null;
  coin?: ArtistCoinQuote | null;
}

export function ArtistCard({ artist, playable = null, coin = null }: ArtistCardProps) {
  const cover = playable?.albumCoverThumbnail || playable?.albumCoverPath || artist.avatarURL;

  return (
    <article className="block text-left">
      <Link href={`/artists/${artist.id}`} className="block">
        <div className="relative mx-auto mb-3 aspect-square w-full max-w-[160px] overflow-hidden rounded-full">
          <CoverImage
            src={artist.avatarURL}
            title={artist.name}
            sizes="160px"
            rounded="rounded-full"
          />
        </div>
        <h3
          className="break-words text-center text-sm font-medium text-foreground"
          data-entity="artist"
        >
          {artist.name}
        </h3>
      </Link>
      {playable ? (
        <div className="mx-auto mt-3 w-full max-w-[160px]">
          <PlayableArt
            songId={playable.id}
            title={playable.title}
            artistName={artist.name}
            artistId={artist.id}
            coverUrl={cover}
            hasCoin={false}
            durationSeconds={playable.duration}
          />
        </div>
      ) : null}
      {coin ? (
        <div className="mt-2">
          <DiscoverCoinRow artistId={artist.id} quote={coin} />
        </div>
      ) : null}
    </article>
  );
}
