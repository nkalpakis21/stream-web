'use client';

import type { ReactNode } from 'react';
import { formatStatCount, type ArtistOwnerStats } from '@/lib/artists/ownerStats';

const TILES = [
  { key: 'plays', label: 'Plays' },
  { key: 'listeners', label: 'Listeners' },
  { key: 'shares', label: 'Shares' },
  { key: 'xPosts', label: 'X posts' },
] as const;

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
  shareOpen = false,
  onOpenShare,
  onCloseShare,
  onConnectX,
  shareAction = null,
}: {
  isOwner: boolean;
  loading: boolean;
  stats: ArtistOwnerStats | null;
  xConfigured?: boolean;
  /** The request failed. Show zeros, and skip the connect link and the share prompt. */
  loadFailed?: boolean;
  /** Connect returned unavailable, so the tile shows the count. */
  connectHidden?: boolean;
  connectBusy?: boolean;
  shareOpen?: boolean;
  onOpenShare?: () => void;
  onCloseShare?: () => void;
  onConnectX?: () => void;
  shareAction?: ReactNode;
}) {
  if (!isOwner) return null;

  const showSkeleton = loading || !stats;
  const showConnect =
    !showSkeleton &&
    !loadFailed &&
    stats != null &&
    !stats.xConnected &&
    xConfigured &&
    !connectHidden;
  const showPrompt = !showSkeleton && !loadFailed && stats != null && allZero(stats);

  return (
    <section className="owner-stats" aria-label="Last 7 days" aria-busy={showSkeleton || undefined} data-owner-stats="">
      <div className="owner-stats-head">
        <p>Last 7 days</p>
        <p>Only you see this</p>
      </div>
      <div className="owner-stats-grid">
        {TILES.map(tile => (
          <div className="owner-stats-tile" key={tile.key} data-stat={tile.key}>
            <p className="owner-stats-label">{tile.label}</p>
            {showSkeleton ? (
              <div className="owner-stats-value owner-stats-skeleton" aria-hidden />
            ) : tile.key === 'xPosts' && showConnect ? (
              <button
                type="button"
                className="owner-stats-ice"
                onClick={onConnectX}
                disabled={connectBusy}
              >
                Connect X
              </button>
            ) : (
              <p className="owner-stats-value">{formatStatCount(tileValue(stats as ArtistOwnerStats, tile.key))}</p>
            )}
          </div>
        ))}
      </div>
      {showPrompt && stats ? (
        <p className="owner-stats-empty">
          {stats.latestPublicSongId ? (
            <>
              <button type="button" className="owner-stats-share" onClick={onOpenShare}>
                Share
              </button>
              {' your latest song to start getting plays.'}
            </>
          ) : (
            'Share your latest song to start getting plays.'
          )}
        </p>
      ) : null}
      {shareOpen && stats?.latestPublicSongId ? (
        <div className="owner-stats-sheet-backdrop">
          <button
            type="button"
            className="owner-stats-sheet-dismiss"
            aria-label="Close share"
            onClick={onCloseShare}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="owner-stats-share-title"
            className="owner-stats-sheet"
          >
            <h2 id="owner-stats-share-title">Share song</h2>
            {shareAction}
            <button type="button" className="owner-stats-sheet-close" onClick={onCloseShare}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
