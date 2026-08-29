'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { ArtistHeader } from '@/components/artists/ArtistHeader';
import { ArtistLookPicker } from '@/components/artists/ArtistLookPicker';
import { useToast, ToastContainer } from '@/components/ui/toast';
import { LaunchExistingArtistCoin } from '@/components/artists/LaunchExistingArtistCoin';
import { updateArtistAvatar } from '@/lib/services/artists';
import { hasLaunchedCoin } from '@/lib/brand/coin';
import { getAvatarGradient, getInitials } from '@/lib/utils/avatar';
import type { AIArtistDocument, PumpFunCoin } from '@/types/firestore';

interface ArtistHeroProps {
  artist: AIArtistDocument;
  timeAgo: string;
  children?: React.ReactNode;
}

export function ArtistHero({ artist, timeAgo, children }: ArtistHeroProps) {
  const { user } = useAuth();
  const router = useRouter();
  const isOwner = Boolean(user && user.uid === artist.ownerId);
  const [avatarURL, setAvatarURL] = useState<string | null>(artist.avatarURL);
  const [pumpFun, setPumpFun] = useState<PumpFunCoin | null | undefined>(
    artist.pumpFun
  );
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();
  const showLaunch = isOwner && !hasLaunchedCoin(pumpFun);

  useEffect(() => {
    setAvatarURL(artist.avatarURL);
  }, [artist.avatarURL]);

  useEffect(() => {
    setPumpFun(artist.pumpFun);
  }, [artist.pumpFun]);

  const handleSelectedUrlChange = (url: string | null) => {
    setSelectedUrl(url);
    if (!url || !user || !isOwner) return;
    if (url === avatarURL) return;

    setLocking(true);
    updateArtistAvatar(artist.id, user.uid, url)
      .then(() => {
        setAvatarURL(url);
        showToast('Artist look locked', 'success');
        router.refresh();
      })
      .catch(err => {
        const message =
          err instanceof Error ? err.message : 'Failed to lock artist look';
        showToast(message, 'error');
      })
      .finally(() => {
        setLocking(false);
      });
  };

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 mb-12">
        <div className="flex-shrink-0">
          <div className="relative w-32 h-32 lg:w-40 lg:h-40 rounded-full overflow-hidden bg-muted ring-4 ring-border shadow-medium">
            {avatarURL ? (
              <Image
                key={avatarURL}
                src={avatarURL}
                alt={artist.name}
                fill
                className="object-cover"
                sizes="160px"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center relative"
                style={{ background: getAvatarGradient(artist.name) }}
              >
                <div
                  className="absolute inset-0 opacity-10"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
                    backgroundSize: '20px 20px',
                  }}
                />
                <span className="relative text-white font-bold text-5xl lg:text-6xl drop-shadow-lg">
                  {getInitials(artist.name)}
                </span>
              </div>
            )}
          </div>
        </div>

        <ArtistHeader artist={{ ...artist, pumpFun }} timeAgo={timeAgo} />

        {children}
      </div>

      {isOwner && (
        <div className="mb-12 max-w-2xl rounded-2xl border border-border bg-muted/20 p-6">
          <ArtistLookPicker
            mode="lock"
            artistName={artist.name}
            lore={artist.lore}
            genres={artist.styleDNA.genres.join(', ')}
            moods={artist.styleDNA.moods.join(', ')}
            influences={artist.styleDNA.influences.join(', ')}
            selectedUrl={selectedUrl}
            onSelectedUrlChange={handleSelectedUrlChange}
            disabled={locking}
          />
          {showLaunch && (
            <div className="mt-6 pt-6 border-t border-border">
              <LaunchExistingArtistCoin
                artistId={artist.id}
                artistName={artist.name}
                lore={artist.lore}
                lookUrl={avatarURL}
                disabled={locking}
                onLaunched={(coin: PumpFunCoin) => {
                  setPumpFun(coin);
                  router.refresh();
                }}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
