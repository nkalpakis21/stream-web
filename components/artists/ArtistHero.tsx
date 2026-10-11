'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { ArtistHeader } from '@/components/artists/ArtistHeader';
import { ArtistOwnerPanel } from '@/components/artists/ArtistOwnerPanel';
import { ArtistCoinModule } from '@/components/artists/ArtistCoinModule';
import { ArtistCoinBuy } from '@/components/artists/ArtistCoinBuy';
import { useToast, ToastContainer } from '@/components/ui/toast';
import { updateArtistAvatar } from '@/lib/services/artists';
import { hasLaunchedCoin } from '@/lib/brand/coin';
import { ArtistFace } from '@/components/artists/ArtistFace';
import { AiMark } from '@/components/brand/AiMark';
import type { ArtistCoinQuote } from '@/lib/brand/coinStats';
import { toPlain, type Plain } from '@/lib/serialize/toPlain';
import type { AIArtistDocument, PumpFunCoin } from '@/types/firestore';

interface ArtistHeroProps {
  artist: Plain<AIArtistDocument>;
  coin?: ArtistCoinQuote | null;
  /** Song-card face order. Empty means the initials disc, never a blank circle. */
  faceSources?: string[];
  followerCount?: number | null;
  /** Server-side. False hides Connect X. Never a key value. */
  xConfigured?: boolean;
  children?: React.ReactNode;
}

export function ArtistHero({
  artist,
  coin = null,
  faceSources = [],
  followerCount = null,
  xConfigured = false,
  children,
}: ArtistHeroProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const isOwner = Boolean(user && user.uid === artist.ownerId);
  const [avatarURL, setAvatarURL] = useState<string | null>(artist.avatarURL);
  const [lore, setLore] = useState(artist.lore);
  const [pumpFun, setPumpFun] = useState<Plain<PumpFunCoin> | null | undefined>(
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
    setLore(artist.lore);
  }, [artist.lore]);

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

  const coinAside = coin ? (
    <div className="w-full lg:w-[320px] lg:flex-shrink-0">
      <ArtistCoinModule quote={coin} buyUrl={buyUrl} />
      <ArtistCoinBuy url={buyUrl} />
    </div>
  ) : null;

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {!loading && isOwner ? (
        <>
          <ArtistOwnerPanel
            artist={{ ...artist, pumpFun, lore }}
            lore={lore}
            avatarURL={avatarURL}
            selectedUrl={selectedUrl}
            onSelectedUrlChange={handleSelectedUrlChange}
            onLoreSaved={next => {
              setLore(next);
              router.refresh();
            }}
            locking={locking}
            showLaunch={showLaunch}
            followerCount={followerCount}
            xConfigured={xConfigured}
            onLaunched={(next: PumpFunCoin) => {
              setPumpFun(toPlain(next));
              router.refresh();
            }}
          />
          {coin ? <div className="mb-12">{coinAside}</div> : null}
        </>
      ) : (
        <div className="mb-12 flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
          <div className="flex min-w-0 flex-1 gap-5">
            <ArtistFace name={artist.name} sources={faceSources} size="hero" />
            <div className="min-w-0 flex-1">
              <div className="mb-2">
                <AiMark />
              </div>
              <ArtistHeader artist={{ ...artist, pumpFun }} followerCount={followerCount} />
            </div>
          </div>
          {coinAside}
        </div>
      )}

      {children}
    </>
  );
}
