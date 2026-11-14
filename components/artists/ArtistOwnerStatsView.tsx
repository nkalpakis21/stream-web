'use client';

import { formatStatCount, type ArtistOwnerStats } from '@/lib/artists/ownerStats';

const TILES = [
  { key: 'plays', label: 'Plays' },
  { key: 'listeners', label: 'Listeners' },
  { key: 'shares', label: 'Shares' },
  { key: 'xPosts', label: 'X posts' },
] as const;

const FAILED_VALUE = '—';

function tileValue(stats: ArtistOwnerStats, key: (typeof TILES)[number]['key']): number {
  return stats[key];
}

function allZero(stats: ArtistOwnerStats): boolean {
  return stats.plays === 0 && stats.listeners === 0 && stats.shares === 0 && stats.xPosts === 0;
}

export function ArtistOwnerStatsView({
  isOwner,
  loading,
  stats,
  xConfigured = false,
  loadFailed = false,
  connectHidden = false,
  connectBusy = false,
  onShare,
  onRetry,
  onConnectX,
}: {
  isOwner: boolean;
  loading: boolean;
  stats: ArtistOwnerStats | null;
  xConfigured?: boolean;
  /** The request failed. Tiles show an em dash, not a zero. */
  loadFailed?: boolean;
  /** Connect returned unavailable, so the tile shows the count. */
  connectHidden?: boolean;
  connectBusy?: boolean;
  onShare?: () => void;
  onRetry?: () => void;
  onConnectX?: () => void;
}) {
  if (!isOwner) return null;

  const showError = !loading && loadFailed;
  const showSkeleton = loading || (!stats && !showError);
  const showConnect =
    !showSkeleton &&
    !showError &&
    stats != null &&
    !stats.xConnected &&
    xConfigured &&
    !connectHidden;
  const showPrompt = !showSkeleton && !showError && stats != null && allZero(stats);

  return (
    <section className="owner-stats" aria-label="Last 7 days" aria-busy={showSkeleton || undefined} data-owner-stats="">
      <div className="owner-stats-head">
        <p>Last 7 days</p>
        <p>Only you see this</p>
      </div>
      <div className="owner-stats-grid">
        {TILES.map(tile => {
          if (tile.key === 'xPosts' && showConnect) {
            return (
              <button
                key={tile.key}
                type="button"
                className="owner-stats-tile owner-stats-connect"
                data-stat={tile.key}
                onClick={onConnectX}
                disabled={connectBusy}
              >
                <span className="owner-stats-label">{tile.label}</span>
                <span className="owner-stats-connect-value">Connect X</span>
              </button>
            );
          }
          return (
            <div className="owner-stats-tile" key={tile.key} data-stat={tile.key}>
              <p className="owner-stats-label">{tile.label}</p>
              {showSkeleton ? (
                <div className="owner-stats-value owner-stats-skeleton" aria-hidden />
              ) : showError ? (
                <p className="owner-stats-value">{FAILED_VALUE}</p>
              ) : (
                <p className="owner-stats-value">
                  {formatStatCount(tileValue(stats as ArtistOwnerStats, tile.key))}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {showPrompt && stats ? (
        <p className="owner-stats-empty">
          {stats.latestPublicSongId ? (
            <>
              <button type="button" className="owner-stats-share" onClick={onShare}>
                Share
              </button>
              {' your latest song to start getting plays.'}
            </>
          ) : (
            'Share your latest song to start getting plays.'
          )}
        </p>
      ) : null}
      {showError ? (
        <div className="owner-stats-error">
          <p>{"Couldn't load stats."}</p>
          <button type="button" className="owner-stats-retry" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}
    </section>
  );
}
