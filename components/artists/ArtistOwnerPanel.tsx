'use client';

import { Suspense } from 'react';
import { ArtistLookPicker } from '@/components/artists/ArtistLookPicker';
import { ArtistBioEditor } from '@/components/artists/ArtistBioEditor';
import { ArtistXPanel } from '@/components/artists/ArtistXPanel';
import { LaunchExistingArtistCoin } from '@/components/artists/LaunchExistingArtistCoin';
import { FollowersList } from '@/components/artists/FollowersList';
import { isHonestBio } from '@/lib/brand/bio';
import type { AIArtistDocument, PumpFunCoin } from '@/types/firestore';
import '@/components/artists/owner-panel.css';

interface ArtistOwnerPanelProps {
  artist: AIArtistDocument;
  lore: string;
  avatarURL: string | null;
  selectedUrl: string | null;
  onSelectedUrlChange: (url: string | null) => void;
  onLoreSaved: (lore: string) => void;
  locking: boolean;
  showLaunch: boolean;
  onLaunched: (coin: PumpFunCoin) => void;
}

export function ArtistOwnerPanel({
  artist,
  lore,
  avatarURL,
  selectedUrl,
  onSelectedUrlChange,
  onLoreSaved,
  locking,
  showLaunch,
  onLaunched,
}: ArtistOwnerPanelProps) {
  const hasBio = isHonestBio(lore, artist.name);
  const bioPreview = hasBio
    ? lore.trim()
    : 'Late-night house sets and sticky-floor anthems. Write your bio so listeners know who you are.';

  return (
    <section className="owner-panel">
      <div className="owner-panel-kicker">
        <p className="owner-panel-kicker-text">
          <span className="owner-panel-kicker-lead">Artist settings</span>
          {' · Face, bio, X, and optional coin'}
        </p>
        <span className="owner-chip">Owner</span>
      </div>

      <div className="owner-panel-top">
        <ArtistLookPicker
          mode="lock"
          artistName={artist.name}
          lore={lore}
          genres={artist.styleDNA.genres.join(', ')}
          moods={artist.styleDNA.moods.join(', ')}
          influences={artist.styleDNA.influences.join(', ')}
          selectedUrl={selectedUrl}
          lockedUrl={avatarURL}
          onSelectedUrlChange={onSelectedUrlChange}
          disabled={locking}
        />

        <div className="owner-identity">
          <h1 className="listen-h1 owner-identity-name" data-entity="artist">
            {artist.name}
          </h1>
          <div className="owner-identity-followers">
            <FollowersList artistId={artist.id} />
          </div>
          <p
            className="owner-identity-bio"
            style={hasBio ? undefined : { color: 'var(--mute)' }}
          >
            {bioPreview}
          </p>
          <ArtistBioEditor
            artistId={artist.id}
            currentBio={lore}
            onSaved={onLoreSaved}
          />
        </div>
      </div>

      <div className="owner-flat-card">
        <Suspense fallback={null}>
          <ArtistXPanel artistId={artist.id} ownerId={artist.ownerId} />
        </Suspense>
        {showLaunch ? (
          <>
            <div className="owner-flat-divider" />
            <LaunchExistingArtistCoin
              artistId={artist.id}
              artistName={artist.name}
              lore={lore}
              lookUrl={avatarURL}
              disabled={locking}
              onLaunched={onLaunched}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
