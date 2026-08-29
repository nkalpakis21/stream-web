'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useSearchParams } from 'next/navigation';
import { isProfileSyncUnavailableError } from '@/lib/x/profileSyncUnavailable';

interface XPostRow {
  tweetId: string;
  url: string;
  songId: string;
  songTitle: string;
  text: string;
  createdAt: number;
}

interface XState {
  status: 'disconnected' | 'connected' | 'paused';
  username: string | null;
  userId: string | null;
  connectedAt: number | null;
  pausedAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  profileSyncedAt: number | null;
  posts: XPostRow[];
}

const DISCONNECTED: XState = {
  status: 'disconnected',
  username: null,
  userId: null,
  connectedAt: null,
  pausedAt: null,
  lastError: null,
  lastErrorAt: null,
  profileSyncedAt: null,
  posts: [],
};

async function authHeaders(user: { getIdToken: (force?: boolean) => Promise<string> }) {
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export function ArtistXPanel({
  artistId,
  ownerId,
}: {
  artistId: string;
  ownerId: string;
}) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const isOwner = Boolean(user && user.uid === ownerId);

  const [available, setAvailable] = useState<boolean | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [x, setX] = useState<XState>(DISCONNECTED);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !isOwner) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/x/artists/${artistId}`, {
        headers: await authHeaders(user),
      });
      const data = await res.json().catch(() => ({}));
      setAvailable(Boolean(data.available));
      setUnavailableMessage(data.message || data.error || null);
      if (data.x) {
        setX({
          ...DISCONNECTED,
          ...data.x,
          posts: Array.isArray(data.x.posts) ? data.x.posts : [],
        });
      }
    } catch (err) {
      console.error('[ArtistXPanel]', err);
    } finally {
      setLoading(false);
    }
  }, [artistId, isOwner, user]);

  useEffect(() => {
    if (!isOwner) return;
    load();
  }, [isOwner, load]);

  useEffect(() => {
    const flag = searchParams.get('x');
    const message = searchParams.get('xMessage');
    if (flag === 'connected') {
      setBanner('X connected. Streamstar will post when a public song goes live.');
      setBannerError(null);
    } else if (flag === 'error') {
      setBannerError(message || 'X connect failed.');
      setBanner(null);
    }
  }, [searchParams]);

  if (!isOwner) return null;

  const startConnect = async () => {
    if (!user) return;
    setBusy(true);
    setBannerError(null);
    try {
      const res = await fetch('/api/x/connect', {
        method: 'POST',
        headers: await authHeaders(user),
        body: JSON.stringify({ artistId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503 || data.available === false) {
        setBannerError(
          data.error ||
            'X is not configured (set X_CLIENT_ID and X_CLIENT_SECRET). Connect is disabled.'
        );
        setAvailable(false);
        return;
      }
      if (!res.ok || !data.authorizeUrl) {
        throw new Error(data.error || 'Could not start X connect.');
      }
      window.location.href = data.authorizeUrl;
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Could not start X connect.');
    } finally {
      setBusy(false);
    }
  };

  const setPaused = async (paused: boolean) => {
    if (!user) return;
    setBusy(true);
    setBannerError(null);
    try {
      const res = await fetch('/api/x/pause', {
        method: 'POST',
        headers: await authHeaders(user),
        body: JSON.stringify({ artistId, paused }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not update X posting.');
      await load();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Could not update X posting.');
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
    setBannerError(null);
    try {
      const res = await fetch('/api/x/disconnect', {
        method: 'POST',
        headers: await authHeaders(user),
        body: JSON.stringify({ artistId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not disconnect X.');
      await load();
      setBanner('X disconnected.');
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Could not disconnect X.');
    } finally {
      setBusy(false);
    }
  };

  const connected = x.status === 'connected' || x.status === 'paused';
  const lastError = isProfileSyncUnavailableError(x.lastError)
    ? null
    : x.lastError;

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3 max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">X</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Optional public X as this artist. Streamstar posts once when a public song goes live.
          </p>
        </div>
        {connected && x.username && (
          <a
            href={`https://x.com/${x.username}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent hover:underline"
          >
            @{x.username}
          </a>
        )}
      </div>

      {available === false && (
        <p className="text-xs text-muted-foreground">
          {unavailableMessage ||
            'X is not configured (set X_CLIENT_ID and X_CLIENT_SECRET). Connect is disabled.'}
        </p>
      )}

      {banner && (
        <p className="text-xs text-green-600" role="status">
          {banner}
        </p>
      )}
      {(bannerError || lastError) && (
        <p className="text-xs text-red-500" role="alert">
          {bannerError || lastError}
        </p>
      )}

      {x.status === 'paused' && (
        <p className="text-xs text-amber-600">
          Posting is paused
          {lastError ? ' because of an X auth or spam failure.' : '.'} Resume or disconnect anytime.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!connected && (
          <button
            type="button"
            onClick={startConnect}
            disabled={busy || loading || available === false}
            className="px-3 py-1.5 text-sm rounded-lg bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Connecting…' : 'Connect X'}
          </button>
        )}
        {x.status === 'connected' && (
          <button
            type="button"
            onClick={() => setPaused(true)}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted/50 disabled:opacity-50"
          >
            Pause posting
          </button>
        )}
        {x.status === 'paused' && (
          <button
            type="button"
            onClick={() => setPaused(false)}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted/50 disabled:opacity-50"
          >
            Resume posting
          </button>
        )}
        {connected && (
          <>
            <button
              type="button"
              onClick={startConnect}
              disabled={busy || available === false}
              className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted/50 disabled:opacity-50"
            >
              Reconnect
            </button>
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted/50 disabled:opacity-50"
            >
              Disconnect
            </button>
          </>
        )}
      </div>

      {connected && (
        <div className="pt-2 border-t border-border/60">
          <p className="text-xs font-medium text-muted-foreground mb-2">Activity</p>
          {x.posts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No posts yet. One post per public song when it goes live.</p>
          ) : (
            <ul className="space-y-2">
              {x.posts.map(post => (
                <li key={post.tweetId} className="text-xs text-foreground/80">
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline"
                  >
                    {post.songTitle || 'Post'}
                  </a>
                  <span className="text-muted-foreground"> — </span>
                  <span className="line-clamp-2">{post.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
