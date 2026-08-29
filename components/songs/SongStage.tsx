'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PlayableArt } from '@/components/songs/PlayableArt';

interface VersionOption {
  id: string;
  audioURL: string | null;
  isPrimary: boolean;
}

interface SongStageProps {
  songId: string;
  songTitle: string;
  artistId: string | null;
  artistName: string;
  albumCoverUrl: string | null;
  audioUrl: string | null;
  versions: VersionOption[];
  pending?: boolean;
  children?: React.ReactNode;
}

export function SongStage({
  songId,
  songTitle,
  artistId,
  artistName,
  albumCoverUrl,
  audioUrl,
  versions,
  pending = false,
  children,
}: SongStageProps) {
  const playable = useMemo(
    () => versions.filter(v => v.audioURL),
    [versions]
  );
  const [activeId, setActiveId] = useState(
    playable.find(v => v.isPrimary)?.id || playable[0]?.id || null
  );
  const active = playable.find(v => v.id === activeId) || playable[0];
  const currentAudio = active?.audioURL || audioUrl;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
      <PlayableArt
        songId={songId}
        title={songTitle}
        artistName={artistName}
        artistId={artistId || undefined}
        coverUrl={albumCoverUrl}
        audioUrl={currentAudio}
        className="w-full"
      />
      <div className="min-w-0">
        <h1 className="listen-h1" data-entity="track">{songTitle}</h1>
        {artistId ? (
          <Link href={`/artists/${artistId}`} className="mt-2 inline-block text-lg text-primary underline-offset-4 hover:underline" data-entity="artist">
            {artistName}
          </Link>
        ) : (
          <p className="mt-2 text-lg text-muted-foreground" data-entity="artist">{artistName}</p>
        )}
        {pending && !currentAudio && (
          <p className="mt-4 text-sm text-muted-foreground">Making the track…</p>
        )}

        {playable.length > 1 && (
          <div className="mt-6">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Versions</p>
            <div className="flex flex-wrap gap-2">
              {playable.map((version, index) => {
                const label = String.fromCharCode(65 + index);
                const selected = version.id === (active?.id ?? activeId);
                return (
                  <button
                    key={version.id}
                    type="button"
                    onClick={() => setActiveId(version.id)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                      selected
                        ? 'bg-secondary text-foreground'
                        : 'border border-border text-muted-foreground'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
