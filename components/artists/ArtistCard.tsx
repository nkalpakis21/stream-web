import Link from 'next/link';
import type { AIArtistDocument, SongDocument } from '@/types/firestore';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import { formatHeatCoinCluster } from '@/lib/brand/coinStats';
import { artistFaceSources, songCoverCandidates } from '@/lib/images/artistFace';
import { ArtistFace } from '@/components/artists/ArtistFace';
import './artist-card.css';

interface ArtistCardProps {
  artist: AIArtistDocument;
  playable?: SongDocument | null;
  coin?: ArtistCoinQuote | null;
  trackCount?: number;
}

export function ArtistCard({
  artist,
  playable = null,
  coin = null,
  trackCount,
}: ArtistCardProps) {
  const sources = artistFaceSources(artist.avatarURL, songCoverCandidates(playable));
  const { price, change, tone } = formatHeatCoinCluster(coin);
  const changeColor =
    tone === 'down' ? 'var(--down)' : tone === 'up' ? 'var(--heat)' : 'var(--mute)';
  const tracksLabel =
    typeof trackCount === 'number' && trackCount > 0
      ? `${trackCount} ${trackCount === 1 ? 'track' : 'tracks'}`
      : null;

  return (
    <article className="h-full">
      <Link href={`/artists/${artist.id}`} className="artist-index-card">
        <ArtistFace name={artist.name} sources={sources} />
        <h3 className="artist-index-name" data-entity="artist">
          {artist.name}
        </h3>
        <p className="artist-index-tracks">{tracksLabel}</p>
        <p className="artist-index-pulse">
          <span style={{ color: 'var(--ink)' }}>{price}</span>
          <span style={{ color: 'var(--mute)' }}> · </span>
          <span style={{ color: changeColor }}>{change}</span>
        </p>
      </Link>
    </article>
  );
}
