'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { webPlatformHeaders } from '@/lib/funnel/platform';
import { useSearchParams } from 'next/navigation';
import { XAutoPostRow } from '@/components/artists/XAutoPostRow';
import { ownerSeesXAutoPost } from '@/lib/x/autoPost';
import { startXConnect } from '@/lib/x/connectClient';
import { xAutoPostStatusLine } from '@/lib/x/statusCopy';

interface XState {
  status: 'disconnected' | 'connected' | 'paused';
  username: string | null;
  autoPost: boolean;
  lastPostedAt: number | null;
  nextPostAtMs: number | null;
  pendingDeferred: { songId: string; title: string; notBeforeMs: number } | null;
  lastSkippedTitle: string | null;
}

const DISCONNECTED: XState = {
  status: 'disconnected',
  username: null,
  autoPost: false,
  lastPostedAt: null,
  nextPostAtMs: null,
  pendingDeferred: null,
  lastSkippedTitle: null,
};

async function authHeaders(user: { getIdToken: (force?: boolean) => Promise<string> }) {
  const token = await user.getIdToken();
  return webPlatformHeaders({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });
}

function visibleXMessage(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/X_CLIENT|env var|not configured/i.test(value)) return null;
  return value;
}

export function ArtistXPanel({
  artistId,
  ownerId,
  configured,
}: {
  artistId: string;
  ownerId: string;
  /** Server-side. When false the row is omitted. Never a key value. */
  configured: boolean;
}) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const isOwner = Boolean(user && user.uid === ownerId);

  const [hidden, setHidden] = useState(!configured);
  const [x, setX] = useState<XState>(DISCONNECTED);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!configured || !user || !isOwner) return;
    try {
      const res = await fetch(`/api/x/artists/${artistId}`, {
        cache: 'no-store',
        headers: await authHeaders(user),
      });
      const data = await res.json().catch(() => ({}));
      if (data.available === false) {
        setHidden(true);
        return;
      }
      if (data.x) {
        setX({
          status: data.x.status === 'paused' || data.x.status === 'connected' ? data.x.status : 'disconnected',
          username: typeof data.x.username === 'string' ? data.x.username : null,
          autoPost: data.x.autoPost === true,
          lastPostedAt: typeof data.x.lastPostedAt === 'number' ? data.x.lastPostedAt : null,
          nextPostAtMs: typeof data.x.nextPostAtMs === 'number' ? data.x.nextPostAtMs : null,
          pendingDeferred:
            data.x.pendingDeferred &&
            typeof data.x.pendingDeferred.title === 'string' &&
            typeof data.x.pendingDeferred.notBeforeMs === 'number'
              ? data.x.pendingDeferred
              : null,
          lastSkippedTitle:
            typeof data.x.lastSkippedTitle === 'string' ? data.x.lastSkippedTitle : null,
        });
        setNowMs(Date.now());
      }
    } catch (err) {
      console.error('[ArtistXPanel]', err);
    } finally {
      setLoaded(true);
    }
  }, [artistId, configured, isOwner, user]);

  useEffect(() => {
    if (!configured || !isOwner) return;
    load();
  }, [configured, isOwner, load]);

  useEffect(() => {
    const flag = searchParams.get('x');
    const message = searchParams.get('xMessage');
    if (flag === 'error') {
      setError(visibleXMessage(message) || 'X connect failed.');
    }
  }, [searchParams]);

  if (!ownerSeesXAutoPost(isOwner, configured) || hidden) return null;

  const connected = x.status === 'connected' || x.status === 'paused';
  const paused = x.status === 'paused';
  const status = xAutoPostStatusLine({
    paused,
    autoPost: x.autoPost,
    username: x.username,
    lastPostedAt: x.lastPostedAt,
    pendingTitle: x.pendingDeferred?.title ?? null,
    pendingNotBeforeMs: x.pendingDeferred?.notBeforeMs ?? x.nextPostAtMs,
    lastSkippedTitle: x.lastSkippedTitle,
    nowMs,
  });

  const startConnect = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const result = await startXConnect(artistId, user);
      if (result.status === 'unavailable') {
        setHidden(true);
        return;
      }
      if (result.status === 'error') throw new Error(result.message);
    } catch (err) {
      setError(
        visibleXMessage(err instanceof Error ? err.message : null) || 'Could not start X connect.'
      );
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!user) return;
    if (!confirm('Disconnect X for this artist? Posting will stop until you connect again.')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/x/disconnect', {
        method: 'POST',
        headers: await authHeaders(user),
        body: JSON.stringify({ artistId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(visibleXMessage(data.error) || 'Could not disconnect X.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect X.');
    } finally {
      setBusy(false);
    }
  };

  const setEnabled = async (enabled: boolean) => {
    if (!user || paused) return;
    const previous = x.autoPost;
    setX(current => ({ ...current, autoPost: enabled }));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/x/auto-post', {
        method: 'POST',
        headers: await authHeaders(user),
        body: JSON.stringify({ artistId, enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(visibleXMessage(data.error) || 'Could not update auto-post.');
      await load();
    } catch (err) {
      setX(current => ({ ...current, autoPost: previous }));
      setError(err instanceof Error ? err.message : 'Could not update auto-post.');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded && connected === false && x.status === 'disconnected') {
    return <div className="x-auto-row is-static" aria-hidden />;
  }

  return (
    <XAutoPostRow
      connected={connected}
      paused={paused}
      autoPost={x.autoPost}
      busy={busy || !loaded}
      status={loaded ? status : { tone: 'none', text: '' }}
      error={error}
      onToggle={setEnabled}
      onConnect={startConnect}
      onDisconnect={disconnect}
    />
  );
}
