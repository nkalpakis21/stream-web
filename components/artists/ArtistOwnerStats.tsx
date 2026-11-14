'use client';

import { useEffect, useRef, useState } from 'react';
import { ArtistOwnerStatsView } from '@/components/artists/ArtistOwnerStatsView';
import { useAuth } from '@/components/providers/AuthProvider';
import { ToastContainer, useToast } from '@/components/ui/toast';
import { reportClientFunnelEvent } from '@/lib/analytics/reportFunnel';
import { parseArtistOwnerStats, type ArtistOwnerStats } from '@/lib/artists/ownerStats';
import { shareUrl } from '@/lib/brand/site';
import { openSongShare } from '@/lib/songs/openSongShare';
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
  const [requestId, setRequestId] = useState(0);
  const { toasts, showToast, dismissToast } = useToast();

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
          setStats(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artistId, ownerId, user?.uid, requestId]);

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

  const onShare = () => {
    const songId = stats?.latestPublicSongId;
    if (!songId) return;
    void openSongShare({
      url: shareUrl(`/songs/${songId}`),
      title: 'Latest song',
      songId,
      artistId,
      report: props => reportClientFunnelEvent('song_shared', props),
    })
      .then(result => {
        if (result === 'copied') showToast('Link copied', 'success');
      })
      .catch(error => {
        console.error(
          '[artist-stats] share',
          error instanceof Error ? error.message : 'failed'
        );
      });
  };

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <ArtistOwnerStatsView
        isOwner={isOwner}
        loading={loading}
        loadFailed={loadFailed}
        stats={stats}
        xConfigured={xConfigured}
        connectHidden={connectHidden}
        connectBusy={connectBusy}
        onShare={onShare}
        onRetry={() => setRequestId(id => id + 1)}
        onConnectX={onConnectX}
      />
    </>
  );
}
