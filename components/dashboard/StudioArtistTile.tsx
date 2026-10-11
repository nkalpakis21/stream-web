import Link from 'next/link';
import { ArtistFace } from '@/components/artists/ArtistFace';
import { artistHeroFaceSources } from '@/lib/images/artistFace';
import type { ArtistCardDisplay } from '@/lib/artists/cardDisplay';
import type { AIArtistDocument, SongDocument } from '@/types/firestore';

/** Same face component, order, and circle as the artist hero. */
export function StudioArtistTile({
  artist,
  photoUrl = null,
  songs = null,
}: {
  artist: AIArtistDocument;
  photoUrl?: string | null;
  songs?: readonly {
    isPublic?: unknown;
    artistId?: string;
    deletedAt?: unknown;
    coverPosterUrl?: string | null;
    albumCoverPath?: string | null;
    albumCoverThumbnail?: string | null;
  }[] | null;
}) {
  const list = songs?.filter(item => item.artistId === artist.id && !item.deletedAt) ?? [];
  const sources = artistHeroFaceSources({
    lockedLookUrl: photoUrl,
    avatarURL: artist.avatarURL,
    songs: list,
  });

  return (
    <Link href={`/artists/${artist.id}`} className="flex flex-col items-center text-center">
      <ArtistFace name={artist.name} sources={sources} size="hero" />
      <span className="artist-index-name">{artist.name}</span>
    </Link>
  );
}

export function StudioArtistTiles({
  artists,
  songs,
  displays,
}: {
  artists: AIArtistDocument[];
  songs: readonly SongDocument[];
  displays?: Map<string, ArtistCardDisplay>;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-5">
      {artists.map(artist => (
        <StudioArtistTile
          key={artist.id}
          artist={artist}
          photoUrl={displays?.get(artist.id)?.photoUrl ?? null}
          songs={songs.filter(song => song.artistId === artist.id && !song.deletedAt)}
        />
      ))}
    </div>
  );
}
