import { toPlain, type Plain } from '@/lib/serialize/toPlain';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import type { AIArtistDocument, SongDocument } from '@/types/firestore';

/**
 * Props the artist page hands to client components.
 * Admin SDK documents carry Timestamp class instances; those cannot cross
 * the server/client boundary. Every value here is plain millis data.
 */
export function artistPageClientProps<TArtist, TSong, TCoin>(input: {
  artist: TArtist;
  songs: readonly TSong[];
  coin: TCoin;
  faceSources?: readonly string[];
  followerCount?: number | null;
}): {
  artist: Plain<TArtist>;
  songs: Plain<TSong>[];
  coin: Plain<TCoin>;
  faceSources: string[];
  followerCount: number | null;
} {
  const followerCount =
    typeof input.followerCount === 'number' && Number.isFinite(input.followerCount)
      ? input.followerCount
      : null;
  return {
    artist: toPlain(input.artist),
    songs: toPlain(input.songs),
    coin: toPlain(input.coin),
    faceSources: toPlain([...(input.faceSources ?? [])]),
    followerCount: toPlain(followerCount),
  };
}

export type ArtistPageClientProps = ReturnType<
  typeof artistPageClientProps<AIArtistDocument, SongDocument, ArtistCoinQuote | null>
>;
