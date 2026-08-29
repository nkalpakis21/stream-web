'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { ArtistHeader } from '@/components/artists/ArtistHeader';
import { ArtistLookPicker } from '@/components/artists/ArtistLookPicker';
import { ArtistCoinModule } from '@/components/artists/ArtistCoinModule';
import { ArtistCoinBuy } from '@/components/artists/ArtistCoinBuy';
import { useToast, ToastContainer } from '@/components/ui/toast';
import { LaunchExistingArtistCoin } from '@/components/artists/LaunchExistingArtistCoin';
import { updateArtistAvatar } from '@/lib/services/artists';
import { hasLaunchedCoin } from '@/lib/brand/coin';
import { CoverImage } from '@/components/media/CoverImage';
import { AiMark } from '@/components/brand/AiMark';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import type { AIArtistDocument, PumpFunCoin } from '@/types/firestore';

interface ArtistHeroProps {
  artist: AIArtistDocument;
  coin?: ArtistCoinQuote | null;
  children?: React.ReactNode;
}

export function ArtistHero({ artist, coin = null, children }: ArtistHeroProps) {
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
  const buyUrl = pumpFun?.url?.trim() || null;

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
      <div className="mb-12 flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        <div className="flex min-w-0 flex-1 gap-5">
          <div className="h-[120px] w-[120px] flex-shrink-0 overflow-hidden rounded-full bg-muted">
            <div className="relative h-full w-full">
              <CoverImage
                key={avatarURL || 'placeholder'}
                src={avatarURL}
                title={artist.name}
                sizes="120px"
                rounded="rounded-full"
                unoptimized={false}
              />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2">
              <AiMark />
            </div>
            <ArtistHeader artist={{ ...artist, pumpFun }} />
          </div>
        </div>

        {coin ? (
          <div className="w-full lg:w-[320px] lg:flex-shrink-0">
            <ArtistCoinModule quote={coin} buyUrl={buyUrl} />
            <ArtistCoinBuy url={buyUrl} />
          </div>
        ) : null}
      </div>

      {children}

      {isOwner && (
        <div className="mb-12 max-w-2xl rounded-xl border border-border bg-muted/20 p-6">
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
            <div className="mt-6 border-t border-border pt-6">
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
