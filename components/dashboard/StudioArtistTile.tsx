import Link from 'next/link';
import { ArtistFace } from '@/components/artists/ArtistFace';
import { artistPageFaceSong } from '@/lib/artists/ownerSongs';
import { artistHeroFaceSources } from '@/lib/images/artistFace';
import type { ArtistCardDisplay } from '@/lib/artists/cardDisplay';
import type { AIArtistDocument, SongDocument } from '@/types/firestore';

export function studioArtistFaceSong(
  songs: readonly SongDocument[],
  artistId: string
): SongDocument | null {
  const mine = songs.filter(song => song.artistId === artistId && !song.deletedAt);
  return artistPageFaceSong(mine, true);
}

/** Same face component, order, and circle as the artist hero. */
export function StudioArtistTile({
  artist,
  photoUrl = null,
  song = null,
}: {
  artist: AIArtistDocument;
  photoUrl?: string | null;
  song?: {
    coverPosterUrl?: string | null;
    albumCoverPath?: string | null;
    albumCoverThumbnail?: string | null;
  } | null;
}) {
  const sources = artistHeroFaceSources({
    lockedLookUrl: photoUrl,
    avatarURL: artist.avatarURL,
    song,
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
          song={studioArtistFaceSong(songs, artist.id)}
        />
      ))}
    </div>
  );
}
