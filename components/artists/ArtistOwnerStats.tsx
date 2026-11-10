'use client';

import { useEffect, useRef, useState } from 'react';
import { ArtistOwnerStatsView } from '@/components/artists/ArtistOwnerStatsView';
import { useAuth } from '@/components/providers/AuthProvider';
import { ShareButton } from '@/components/songs/ShareButton';
import { parseArtistOwnerStats, type ArtistOwnerStats } from '@/lib/artists/ownerStats';
import { startXConnect } from '@/lib/x/connectClient';

export function ArtistOwnerStats({
  artistId,
  ownerId,
  xConfigured = false,
}: {
  artistId: string;
  ownerId: string;
  xConfigured?: boolean;
}) {
  const { user } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  const isOwner = Boolean(user && user.uid === ownerId);
  const [loading, setLoading] = useState(isOwner);
  const [loadFailed, setLoadFailed] = useState(false);
  const [stats, setStats] = useState<ArtistOwnerStats | null>(null);
  const [connectHidden, setConnectHidden] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    const current = userRef.current;
    if (!current || current.uid !== ownerId) return;
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    void (async () => {
      try {
        const token = await current.getIdToken();
        const res = await fetch(`/api/artists/${encodeURIComponent(artistId)}/stats`, {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = parseArtistOwnerStats(await res.json().catch(() => null));
        if (!body) throw new Error('invalid stats');
        if (!cancelled) setStats(body);
      } catch (error) {
        console.error(
          '[artist-stats]',
          error instanceof Error ? error.message : 'failed'
        );
        if (!cancelled) {
          setLoadFailed(true);
          setStats({
            plays: 0,
            listeners: 0,
            shares: 0,
            xPosts: 0,
            xConnected: true,
            latestPublicSongId: null,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artistId, ownerId, user?.uid]);

  useEffect(() => {
    if (!shareOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShareOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shareOpen]);

  const onConnectX = () => {
    if (!user || connectBusy) return;
    setConnectBusy(true);
    void startXConnect(artistId, user)
      .then(result => {
        if (result.status === 'unavailable') setConnectHidden(true);
      })
      .catch(error => {
        console.error(
          '[artist-stats] connect',
          error instanceof Error ? error.message : 'failed'
        );
      })
      .finally(() => setConnectBusy(false));
  };

  const songId = stats?.latestPublicSongId ?? null;

  return (
    <ArtistOwnerStatsView
      isOwner={isOwner}
      loading={loading}
      loadFailed={loadFailed}
      stats={stats}
      xConfigured={xConfigured}
      connectHidden={connectHidden}
      connectBusy={connectBusy}
      shareOpen={shareOpen}
      onOpenShare={() => setShareOpen(true)}
      onCloseShare={() => setShareOpen(false)}
      onConnectX={onConnectX}
      shareAction={
        songId ? (
          <ShareButton
            url={`/songs/${songId}`}
            title="Latest song"
            songId={songId}
            artistId={artistId}
          />
        ) : null
      }
    />
  );
}
