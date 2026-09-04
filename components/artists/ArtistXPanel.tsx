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

  const sub =
    available === false
      ? unavailableMessage ||
        'X is not configured (set X_CLIENT_ID and X_CLIENT_SECRET). Connect is disabled.'
      : connected
        ? x.status === 'paused'
          ? lastError
            ? 'Posting is paused because of an X auth or spam failure.'
            : 'Posting is paused. Resume or disconnect anytime.'
          : 'Verify you’re you and pull your handle onto the artist page.'
        : 'Verify you’re you and pull your handle onto the artist page.';

  return (
    <div>
      <div className="owner-flat-row">
        <div className="owner-flat-icon is-square" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.726-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
          </svg>
        </div>
        <div className="owner-flat-copy">
          <p className="owner-flat-title">
            Connect X
            {connected && x.username ? (
              <a
                href={`https://x.com/${x.username}`}
                target="_blank"
                rel="noreferrer"
              >
                @{x.username}
              </a>
            ) : null}
          </p>
          <p className="owner-flat-sub">{sub}</p>
          {banner && (
            <p className="owner-flat-sub" style={{ color: '#6ee7b7' }} role="status">
              {banner}
            </p>
          )}
          {(bannerError || lastError) && (
            <p className="owner-flat-sub" style={{ color: '#ff4d6a' }} role="alert">
              {bannerError || lastError}
            </p>
          )}
        </div>
        <div className="owner-flat-action">
          {!connected && (
            <button
              type="button"
              onClick={startConnect}
              disabled={busy || loading || available === false}
              className="btn-primary"
            >
              {busy ? 'Connecting…' : 'Connect X'}
            </button>
          )}
          {x.status === 'connected' && (
            <button
              type="button"
              onClick={() => setPaused(true)}
              disabled={busy}
              className="btn-ghost"
            >
              Pause posting
            </button>
          )}
          {x.status === 'paused' && (
            <button
              type="button"
              onClick={() => setPaused(false)}
              disabled={busy}
              className="btn-ghost"
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
                className="btn-ghost"
              >
                Reconnect
              </button>
              <button
                type="button"
                onClick={disconnect}
                disabled={busy}
                className="btn-ghost"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      {connected && (
        <div className="owner-flat-extra">
          <p className="owner-flat-sub" style={{ fontWeight: 600, marginBottom: 8 }}>
            Activity
          </p>
          {x.posts.length === 0 ? (
            <p className="owner-flat-sub">
              No posts yet. One post per public song when it goes live.
            </p>
          ) : (
            <ul className="space-y-2">
              {x.posts.map(post => (
                <li key={post.tweetId} className="owner-flat-sub" style={{ color: 'var(--ink)' }}>
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
