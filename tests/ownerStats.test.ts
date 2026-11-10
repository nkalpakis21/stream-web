import './render-setup';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { ArtistOwnerStatsView } from '../components/artists/ArtistOwnerStatsView';
import { openSongShare } from '../lib/songs/openSongShare';
import {
  ARTIST_STATS_PLAY_DEDUPE_MS,
  ARTIST_STATS_WINDOW_MS,
  aggregateArtistOwnerStats,
  formatStatCount,
  type ArtistStatEvent,
} from '../lib/artists/ownerStats';
import { setAdminDbForTests } from '../lib/firebase/admin';
import { PLAY_REPEAT_WINDOW_MS } from '../lib/server/funnel';
import { GET } from '../app/api/artists/[id]/stats/route';
import { setArtistStatsAuthForTests } from '../lib/server/artistStatsAuth';

const NOW = 1_700_000_000_000;
const START = NOW - ARTIST_STATS_WINDOW_MS;
const ARTIST = 'artist-1';
const SONGS = new Set(['song-1', 'song-2']);

function play(partial: Partial<ArtistStatEvent> & Pick<ArtistStatEvent, 'atMs'>): ArtistStatEvent {
  return {
    event: 'play',
    songId: 'song-1',
    uid: 'fan',
    ...partial,
  };
}

function stats(
  events: ArtistStatEvent[],
  extra?: Partial<Parameters<typeof aggregateArtistOwnerStats>[0]>
) {
  return aggregateArtistOwnerStats({
    artistId: ARTIST,
    songIds: SONGS,
    events,
    ownerUid: 'alice',
    nowMs: NOW,
    xConnected: true,
    latestPublicSongId: 'song-1',
    ...extra,
  });
}

describe('artist owner stats aggregation', () => {
  it('uses the same 30s play window the funnel writer uses', () => {
    assert.equal(ARTIST_STATS_PLAY_DEDUPE_MS, PLAY_REPEAT_WINDOW_MS);
  });

  it('excludes the owner by uid and by anon id', () => {
    const result = stats(
      [
        play({ atMs: START + 1_000, uid: 'alice' }),
        play({ atMs: START + 2_000, uid: null, visitorId: 'ssv_owner' }),
        play({ atMs: START + 3_000, uid: 'bob', visitorId: 'ssv_owner' }),
        play({ atMs: START + 40_000, uid: 'fan' }),
        { event: 'song_shared', atMs: START + 4_000, songId: 'song-1', uid: 'alice' },
        { event: 'song_shared', atMs: START + 5_000, songId: 'song-1', uid: null, anonId: 'ssv_owner' },
        { event: 'song_shared', atMs: START + 6_000, songId: 'song-1', uid: 'fan' },
        { event: 'x_post', atMs: START + 7_000, songId: 'song-1', artistId: ARTIST, uid: 'alice' },
      ],
      { ownerAnonId: 'ssv_owner' }
    );
    assert.equal(result.plays, 1);
    assert.equal(result.listeners, 1);
    assert.equal(result.shares, 1);
    assert.equal(result.xPosts, 0);
  });

  it('counts a uid and an anon id as different listeners', () => {
    const result = stats([
      play({ id: 'a', atMs: START + 1_000, uid: 'alice-fan' }),
      play({ id: 'b', atMs: START + 40_000, uid: 'alice-fan' }),
      play({ id: 'c', atMs: START + 1_000, songId: 'song-2', uid: null, visitorId: 'ssv_fan' }),
      play({ id: 'd', atMs: START + 40_000, songId: 'song-2', uid: null, anonId: 'ssv_fan' }),
      play({
        id: 'e',
        atMs: START + 80_000,
        songId: 'song-2',
        uid: 'alice-fan',
        visitorId: 'ssv_other',
      }),
      play({ id: 'f', atMs: START + 120_000, songId: 'song-1', uid: null, visitorId: 'ssv_other' }),
    ]);
    assert.equal(result.plays, 6);
    assert.equal(result.listeners, 3);
  });

  it('collapses repeat plays of the same song and viewer inside 30s', () => {
    const t = START + 10_000;
    const result = stats([
      play({ atMs: t, uid: 'fan', songId: 'song-1' }),
      play({ atMs: t + ARTIST_STATS_PLAY_DEDUPE_MS - 1, uid: 'fan', songId: 'song-1' }),
      play({ atMs: t + ARTIST_STATS_PLAY_DEDUPE_MS, uid: 'fan', songId: 'song-1' }),
      play({ atMs: t + 1_000, uid: 'fan', songId: 'song-2' }),
      play({ atMs: t + 1_000, uid: 'other', songId: 'song-1' }),
      { event: 'song_shared', atMs: t, songId: 'song-1', uid: 'fan' },
      { event: 'song_shared', atMs: t + 1_000, songId: 'song-1', uid: 'fan' },
      play({ id: 'same', atMs: t + 80_000, uid: 'fan', songId: 'song-2' }),
      play({ id: 'same', atMs: t + 80_000, uid: 'fan', songId: 'song-2' }),
    ]);
    assert.equal(result.plays, 5);
    assert.equal(result.listeners, 2);
    assert.equal(result.shares, 2);
  });

  it('keeps the window edges and lets a pre-window play suppress the next one', () => {
    const inside = stats([
      play({ atMs: START, uid: 'fan' }),
      play({ atMs: NOW, uid: 'other', songId: 'song-2' }),
    ]);
    assert.equal(inside.plays, 2);
    assert.equal(inside.listeners, 2);

    const outside = stats([
      play({ atMs: START - 1, uid: 'fan' }),
      play({ atMs: NOW + 1, uid: 'fan', songId: 'song-2' }),
      { event: 'song_shared', atMs: START - 1, songId: 'song-1', uid: 'fan' },
      { event: 'song_shared', atMs: START, songId: 'song-1', uid: 'fan' },
    ]);
    assert.equal(outside.plays, 0);
    assert.equal(outside.listeners, 0);
    assert.equal(outside.shares, 1);

    const suppressed = stats([
      play({ atMs: START - 10_000, uid: 'fan', songId: 'song-1' }),
      play({ atMs: START + 10_000, uid: 'fan', songId: 'song-1' }),
    ]);
    assert.equal(suppressed.plays, 0);

    const exact = stats([
      play({ atMs: START - 1, uid: 'fan', songId: 'song-1' }),
      play({ atMs: START - 1 + ARTIST_STATS_PLAY_DEDUPE_MS, uid: 'fan', songId: 'song-1' }),
    ]);
    assert.equal(exact.plays, 1);

    const posts = stats([], {
      xPosts: [
        { status: 'posted', postedAtMs: START },
        { status: 'posted', postedAtMs: NOW },
        { status: 'posted', postedAtMs: START - 1 },
        { status: 'posted', postedAtMs: NOW + 1 },
        { status: 'deferred', postedAtMs: START + 1 },
        { status: 'failed', postedAtMs: START + 2 },
      ],
    });
    assert.equal(posts.xPosts, 2);
  });

  it('resolves a missing artist id through the song, and ignores another song', () => {
    const result = stats([
      play({ atMs: START + 1_000, songId: 'song-1', artistId: undefined, uid: 'fan' }),
      play({ atMs: START + 40_000, songId: 'song-1', artistId: 'someone-else', uid: 'other' }),
      play({ atMs: START + 1_000, songId: 'song-9', artistId: ARTIST, uid: 'third' }),
      { event: 'song_shared', atMs: START + 2_000, artistId: ARTIST, uid: 'fan' },
      { event: 'song_shared', atMs: START + 3_000, songId: 'song-9', artistId: ARTIST, uid: 'fan' },
    ]);
    assert.equal(result.plays, 2);
    assert.equal(result.listeners, 2);
    assert.equal(result.shares, 1);
  });
});

describe('stat count format', () => {
  it('shows full numbers through 9,999 and one decimal from 10,000', () => {
    assert.equal(formatStatCount(0), '0');
    assert.equal(formatStatCount(999), '999');
    assert.equal(formatStatCount(1000), '1,000');
    assert.equal(formatStatCount(9999), '9,999');
    assert.equal(formatStatCount(10000), '10.0k');
    assert.equal(formatStatCount(12300), '12.3k');
    assert.equal(formatStatCount(12349), '12.3k');
    assert.equal(formatStatCount(12350), '12.4k');
    assert.equal(formatStatCount(Number.NaN), '0');
    assert.equal(formatStatCount(-4), '0');
  });
});

const ZERO = {
  plays: 0,
  listeners: 0,
  shares: 0,
  xPosts: 0,
  xConnected: true,
  latestPublicSongId: 'song-9' as string | null,
};

function view(props: Partial<Parameters<typeof ArtistOwnerStatsView>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(ArtistOwnerStatsView, {
      isOwner: true,
      loading: false,
      stats: ZERO,
      xConfigured: true,
      onShare() {},
      onRetry() {},
      onConnectX() {},
      ...props,
    })
  );
}

describe('artist owner stats view', () => {
  it('shows skeleton tiles while loading and no numbers', () => {
    const html = view({ loading: true, stats: null });
    assert.match(html, /Last 7 days/);
    assert.match(html, /Only you see this/);
    assert.equal(html.match(/owner-stats-skeleton/g)?.length, 4);
    assert.equal(html.match(/owner-stats-tile/g)?.length, 4);
    assert.equal(html.includes('>0<'), false);
    assert.equal(html.includes('Connect X'), false);
    assert.equal(html.includes('Share your latest'), false);
    assert.match(html, /aria-busy="true"/);
  });

  it('shows the zero state, with Share only when a public song exists', () => {
    const linked = view();
    assert.equal(linked.match(/>0</g)?.length, 4);
    assert.match(linked, /class="owner-stats-share"/);
    assert.match(linked, />Share</);
    assert.match(linked, /your latest song to start getting plays\./);
    assert.equal(linked.includes('role="dialog"'), false);
    assert.equal(linked.includes('Share song'), false);

    const plain = view({ stats: { ...ZERO, latestPublicSongId: null } });
    assert.match(plain, /Share your latest song to start getting plays\./);
    assert.equal(plain.includes('owner-stats-share'), false);
    assert.equal(plain.includes('<button'), false);
  });

  it('opens the latest song share directly from Share', () => {
    let shares = 0;
    const element = createElement(ArtistOwnerStatsView, {
      isOwner: true,
      loading: false,
      stats: ZERO,
      xConfigured: true,
      onShare: () => {
        shares += 1;
      },
    });
    const html = renderToStaticMarkup(element);
    assert.match(html, /<button type="button" class="owner-stats-share">Share<\/button>/);
    assert.equal(html.includes('role="dialog"'), false);
    assert.equal(html.includes('Share song'), false);
    element.props.onShare?.();
    assert.equal(shares, 1);
    const css = readFileSync('components/artists/owner-panel.css', 'utf8');
    assert.match(css, /\.owner-stats-share[\s\S]*min-height:\s*44px/);
  });

  it('makes the whole X posts tile the Connect X button', () => {
    let connects = 0;
    const element = createElement(ArtistOwnerStatsView, {
      isOwner: true,
      loading: false,
      stats: {
        plays: 12300,
        listeners: 1000,
        shares: 9999,
        xPosts: 0,
        xConnected: false,
        latestPublicSongId: null,
      },
      xConfigured: true,
      onConnectX: () => {
        connects += 1;
      },
    });
    const html = renderToStaticMarkup(element);
    assert.match(html, />12\.3k</);
    assert.match(html, />1,000</);
    assert.match(html, />9,999</);
    assert.match(
      html,
      /<button type="button" class="owner-stats-tile owner-stats-connect" data-stat="xPosts">/
    );
    assert.match(html, /class="owner-stats-connect-value">Connect X</);
    assert.equal(html.includes('owner-stats-ice'), false);
    assert.equal(html.includes('text-decoration:underline'), false);
    assert.equal(html.includes('Share your latest'), false);
    element.props.onConnectX?.();
    assert.equal(connects, 1);
    const css = readFileSync('components/artists/owner-panel.css', 'utf8');
    assert.match(css, /\.owner-stats-connect[\s\S]*height:\s*76px/);
    assert.match(css, /\.owner-stats-connect-value[\s\S]*color:\s*#E8E6F2/);
    assert.match(css, /\.owner-stats-connect-value[\s\S]*text-decoration:\s*none/);
  });

  it('shows em dashes, not zeros, when stats fail to load', () => {
    const html = view({
      loadFailed: true,
      stats: { ...ZERO, plays: 4, listeners: 2, shares: 1, xPosts: 3, xConnected: false },
    });
    assert.equal(html.match(/—/g)?.length, 4);
    assert.match(html, /Couldn(?:'|&#x27;)t load stats\./);
    assert.match(html, /class="owner-stats-retry"/);
    assert.match(html, />Try again</);
    assert.equal(html.includes('>0<'), false);
    assert.equal(html.includes('>4<'), false);
    assert.equal(html.includes('Connect X'), false);
    assert.equal(html.includes('Share your latest'), false);
  });

  it('retries from the Try again button', () => {
    let retries = 0;
    const element = createElement(ArtistOwnerStatsView, {
      isOwner: true,
      loading: false,
      loadFailed: true,
      stats: null,
      onRetry: () => {
        retries += 1;
      },
    });
    const html = renderToStaticMarkup(element);
    assert.match(html, /<button type="button" class="owner-stats-retry">Try again<\/button>/);
    element.props.onRetry?.();
    assert.equal(retries, 1);
    const css = readFileSync('components/artists/owner-panel.css', 'utf8');
    assert.match(css, /\.owner-stats-retry[\s\S]*min-height:\s*44px/);
  });

  it('renders nothing for someone who is not the owner', () => {
    assert.equal(view({ isOwner: false, loading: true, stats: null }), '');
    assert.equal(
      view({
        isOwner: false,
        stats: { ...ZERO, plays: 4, xConnected: false },
      }),
      ''
    );
  });

  it('places the block above the X row and keeps the tile colors', () => {
    const panel = readFileSync('components/artists/ArtistOwnerPanel.tsx', 'utf8');
    const statsAt = panel.indexOf('<ArtistOwnerStats');
    const xAt = panel.indexOf('<ArtistXPanel');
    assert.ok(statsAt >= 0 && xAt > statsAt);
    const css = readFileSync('components/artists/owner-panel.css', 'utf8');
    const block = css.slice(css.indexOf('.owner-stats {'));
    assert.match(block, /\.owner-stats-grid[\s\S]*grid-template-columns:\s*1fr 1fr/);
    assert.match(block, /min-width:\s*768px[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/);
    assert.match(block, /\.owner-stats-tile[\s\S]*background:\s*#14141C/);
    assert.match(block, /\.owner-stats-tile[\s\S]*border:\s*1px solid #2A2A38/);
    assert.match(block, /\.owner-stats-tile[\s\S]*border-radius:\s*12px/);
    assert.match(block, /\.owner-stats-label[\s\S]*font-family:\s*var\(--font-figtree\)/);
    assert.match(block, /\.owner-stats-label[\s\S]*font-size:\s*12px/);
    assert.match(block, /\.owner-stats-label[\s\S]*#8B8896/);
    assert.match(block, /\.owner-stats-value[\s\S]*font-weight:\s*600/);
    assert.match(block, /\.owner-stats-value[\s\S]*font-size:\s*24px/);
    assert.match(block, /\.owner-stats-value[\s\S]*#F5F4F8/);
    assert.match(block, /\.owner-stats-head p[\s\S]*font-size:\s*13px/);
    assert.match(block, /\.owner-stats-head p[\s\S]*#8B8896/);
    assert.match(block, /\.owner-stats-connect-value[\s\S]*#E8E6F2/);
    assert.match(block, /\.owner-stats-connect[\s\S]*background:\s*#14141C/);
    assert.doesNotMatch(block, /#C8F542|lime/i);
  });
});

describe('openSongShare', () => {
  it('opens the system share sheet and does not copy', async () => {
    let shared: { url?: string; title?: string } | null = null;
    let copied = 0;
    let reported = 0;
    const result = await openSongShare({
      url: 'https://www.streamstar.xyz/songs/song-9',
      title: 'Latest song',
      songId: 'song-9',
      artistId: 'artist-1',
      share: async data => {
        shared = data;
      },
      copy: async () => {
        copied += 1;
      },
      report: () => {
        reported += 1;
      },
    });
    assert.equal(result, 'shared');
    assert.deepEqual(shared, {
      url: 'https://www.streamstar.xyz/songs/song-9',
      title: 'Latest song',
    });
    assert.equal(copied, 0);
    assert.equal(reported, 1);
  });

  it('copies when the sheet is missing and ignores a cancelled sheet', async () => {
    let copied = '';
    let reported = 0;
    const copiedResult = await openSongShare({
      url: 'https://www.streamstar.xyz/songs/song-9',
      title: 'Latest song',
      songId: 'song-9',
      artistId: 'artist-1',
      share: null,
      copy: async url => {
        copied = url;
      },
      report: () => {
        reported += 1;
      },
    });
    assert.equal(copiedResult, 'copied');
    assert.equal(copied, 'https://www.streamstar.xyz/songs/song-9');
    assert.equal(reported, 1);

    reported = 0;
    const cancelled = await openSongShare({
      url: 'https://www.streamstar.xyz/songs/song-9',
      title: 'Latest song',
      share: async () => {
        const error = new Error('cancelled');
        error.name = 'AbortError';
        throw error;
      },
      copy: async () => {
        throw new Error('should not copy');
      },
      report: () => {
        reported += 1;
      },
    });
    assert.equal(cancelled, 'cancelled');
    assert.equal(reported, 0);
  });
});

describe('GET /api/artists/[id]/stats', () => {
  afterEach(() => {
    setArtistStatsAuthForTests(null);
    setAdminDbForTests(null);
  });

  it('returns 403 when the caller is not the owner', async () => {
    setArtistStatsAuthForTests(async () => ({ uid: 'bob' }));
    setAdminDbForTests({
      collection(name: string) {
        return {
          doc(id: string) {
            return {
              async get() {
                assert.equal(name, 'artists');
                return {
                  exists: true,
                  id,
                  data: () => ({
                    id,
                    ownerId: 'alice',
                    isPublic: true,
                    deletedAt: null,
                    name: 'Nova',
                  }),
                };
              },
            };
          },
        };
      },
    });

    const response = await GET(
      new NextRequest('https://streamstar.xyz/api/artists/artist-1/stats', {
        headers: { authorization: 'Bearer token' },
      }),
      { params: { id: 'artist-1' } }
    );
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const body = await response.json();
    assert.equal(body.error, 'Only the owner can view artist stats');
    assert.equal(body.plays, undefined);
    assert.equal(body.listeners, undefined);
    assert.equal(JSON.stringify(body).includes('Nova'), false);
  });
});
