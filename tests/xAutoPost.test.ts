import './render-setup';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { XAutoPostRow } from '../components/artists/XAutoPostRow';
import {
  autoPostSwitchPatch,
  grandfatherStamp,
  isXAuthPaused,
  ownerSeesXAutoPost,
  resolveAutoPost,
} from '../lib/x/autoPost';
import { xPostBlocked, xBlocklistHit, decideXCover } from '../lib/x/blocklist';
import { capPostTimes, evaluatePostCap, X_POST_GAP_MS, X_POST_WINDOW_MS } from '../lib/x/caps';
import { composeSongLivePost, stripXMentions } from '../lib/x/compose';
import { songSharePageUrl } from '../lib/x/config';
import {
  BEFORE_AUTO_POST_REASON,
  planSongLivePost,
  STALE_REASON,
} from '../lib/x/planPost';
import { songAudioReadyAtMs } from '../lib/x/readyAt';
import { formatPostedAgo, xAutoPostStatusLine } from '../lib/x/statusCopy';
import {
  isClientFunnelEvent,
  isFunnelEvent,
  setFunnelStoreForTests,
  trackFunnelEvent,
  type FunnelStore,
} from '../lib/server/funnel';
import type { StyleDNA } from '../types/firestore';

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;
const DNA: StyleDNA = {
  genres: ['house'],
  moods: ['late'],
  tempoRange: { min: 118, max: 124 },
  influences: ['Daft Punk'],
};

function memoryStore() {
  const docs = new Map<string, Record<string, unknown>>();
  const store: FunnelStore = {
    async create(id, data) {
      if (docs.has(id)) {
        const error = new Error('already exists') as Error & { code: number };
        error.code = 6;
        throw error;
      }
      docs.set(id, { ...data });
    },
    async add(data) {
      docs.set(`auto-${docs.size + 1}`, { ...data });
    },
  };
  return {
    store,
    list: () => [...docs.entries()].map(([id, data]) => ({ id, data })),
  };
}

describe('auto-post flag', () => {
  it('defaults off unless a connected artist has no field', () => {
    assert.equal(resolveAutoPost(null), false);
    assert.equal(resolveAutoPost({ status: 'disconnected' }), false);
    assert.equal(resolveAutoPost({ status: 'paused' }), false);
    assert.equal(resolveAutoPost({ status: 'connected', autoPost: false }), false);
    assert.equal(resolveAutoPost({ status: 'paused', autoPost: true }), true);
    assert.equal(resolveAutoPost({ status: 'connected' }), true);
    assert.equal(resolveAutoPost({ status: 'connected', autoPost: undefined }), true);
    assert.equal(resolveAutoPost({ status: 'disconnected', autoPost: undefined }), false);
    assert.equal(ownerSeesXAutoPost(false, true), false);
    assert.equal(ownerSeesXAutoPost(true, false), false);
    assert.equal(ownerSeesXAutoPost(true, true), true);
  });

  it('stamps a missing enabledAt to now and does not backfill', () => {
    const grandfather = grandfatherStamp({ status: 'connected' }, NOW);
    assert.deepEqual(grandfather, { autoPost: true, autoPostEnabledAtMs: NOW });

    const already = grandfatherStamp(
      { status: 'connected', autoPost: true, autoPostEnabledAtMs: NOW - HOUR },
      NOW
    );
    assert.equal(already, null);

    const off = grandfatherStamp({ status: 'connected', autoPost: false }, NOW);
    assert.equal(off, null);

    const paused = grandfatherStamp({ status: 'paused' }, NOW);
    assert.equal(paused, null);

    const oldSong = planSongLivePost({
      nowMs: NOW,
      autoPost: true,
      enabledAtMs: grandfather?.autoPostEnabledAtMs ?? 0,
      songReadyAtMs: NOW - HOUR,
      postedAtMs: [],
      blocked: false,
    });
    assert.deepEqual(oldSong, { type: 'terminal', status: 'skipped', reason: BEFORE_AUTO_POST_REASON });

    const sameInstant = planSongLivePost({
      nowMs: NOW,
      autoPost: true,
      enabledAtMs: NOW,
      songReadyAtMs: NOW,
      postedAtMs: [],
      blocked: false,
    });
    assert.deepEqual(sameInstant, { type: 'post' });

    const later = planSongLivePost({
      nowMs: NOW + HOUR,
      autoPost: true,
      enabledAtMs: NOW,
      songReadyAtMs: NOW + 1,
      postedAtMs: [],
      blocked: false,
    });
    assert.deepEqual(later, { type: 'post' });
  });

  it('resets enabledAt when auto-post is turned off and on again', () => {
    const first = autoPostSwitchPatch(true, NOW);
    assert.deepEqual(first, { autoPost: true, autoPostEnabledAtMs: NOW });
    const off = autoPostSwitchPatch(false, NOW + HOUR);
    assert.deepEqual(off, { autoPost: false });
    assert.equal('autoPostEnabledAtMs' in off, false);
    const again = autoPostSwitchPatch(true, NOW + 5 * HOUR);
    assert.equal(again.autoPostEnabledAtMs, NOW + 5 * HOUR);

    const deferredThenReset = planSongLivePost({
      nowMs: NOW + 5 * HOUR,
      autoPost: true,
      enabledAtMs: again.autoPostEnabledAtMs ?? 0,
      songReadyAtMs: NOW + HOUR,
      postedAtMs: [],
      blocked: false,
      existingStatus: 'deferred',
    });
    assert.equal(deferredThenReset.type, 'terminal');
    if (deferredThenReset.type === 'terminal') {
      assert.equal(deferredThenReset.reason, BEFORE_AUTO_POST_REASON);
    }

    const readyAfterReset = planSongLivePost({
      nowMs: NOW + 6 * HOUR,
      autoPost: true,
      enabledAtMs: again.autoPostEnabledAtMs ?? 0,
      songReadyAtMs: NOW + 5 * HOUR,
      postedAtMs: [],
      blocked: false,
    });
    assert.deepEqual(readyAfterReset, { type: 'post' });
  });
});

describe('post caps', () => {
  it('allows a post when the day and the gap are clear', () => {
    assert.deepEqual(
      evaluatePostCap({ nowMs: NOW, readyAtMs: NOW, postedAtMs: [] }),
      { action: 'post' }
    );
    assert.deepEqual(
      evaluatePostCap({
        nowMs: NOW,
        readyAtMs: NOW,
        postedAtMs: [NOW - 5 * HOUR, NOW - 3 * HOUR],
      }),
      { action: 'post' }
    );
  });

  it('defers inside the 2h gap and the rolling 3-per-day cap', () => {
    const gap = evaluatePostCap({
      nowMs: NOW,
      readyAtMs: NOW,
      postedAtMs: [NOW - 30 * 60 * 1000],
    });
    assert.deepEqual(gap, { action: 'defer', notBeforeMs: NOW - 30 * 60 * 1000 + X_POST_GAP_MS });

    const oldest = NOW - 20 * HOUR;
    const day = evaluatePostCap({
      nowMs: NOW,
      readyAtMs: NOW,
      postedAtMs: [oldest, NOW - 10 * HOUR, NOW - 4 * HOUR],
    });
    assert.deepEqual(day, { action: 'defer', notBeforeMs: oldest + X_POST_WINDOW_MS });
  });

  it('drops a deferred song that cannot post within 24h of becoming ready', () => {
    const readyAtMs = NOW - 23 * HOUR;
    const tooLate = evaluatePostCap({
      nowMs: NOW,
      readyAtMs,
      postedAtMs: [NOW - 30 * 60 * 1000],
    });
    assert.deepEqual(tooLate, { action: 'skip_stale' });

    const agedOut = evaluatePostCap({
      nowMs: readyAtMs + X_POST_WINDOW_MS + 1,
      readyAtMs,
      postedAtMs: [],
    });
    assert.deepEqual(agedOut, { action: 'skip_stale' });

    const stillIn = evaluatePostCap({
      nowMs: readyAtMs + X_POST_WINDOW_MS,
      readyAtMs,
      postedAtMs: [],
    });
    assert.deepEqual(stillIn, { action: 'post' });

    const deferred = planSongLivePost({
      nowMs: NOW,
      autoPost: true,
      enabledAtMs: NOW - 2 * HOUR,
      songReadyAtMs: NOW,
      postedAtMs: [NOW - 30 * 60 * 1000],
      blocked: false,
    });
    assert.equal(deferred.type, 'defer');

    const later = planSongLivePost({
      nowMs: NOW + X_POST_GAP_MS,
      autoPost: true,
      enabledAtMs: NOW - 2 * HOUR,
      songReadyAtMs: NOW,
      postedAtMs: [NOW - 30 * 60 * 1000],
      blocked: false,
      existingStatus: 'deferred',
    });
    assert.deepEqual(later, { type: 'post' });

    const missed = planSongLivePost({
      nowMs: NOW + X_POST_WINDOW_MS + 1,
      autoPost: true,
      enabledAtMs: NOW - 2 * HOUR,
      songReadyAtMs: NOW,
      postedAtMs: [],
      blocked: false,
      existingStatus: 'deferred',
    });
    assert.deepEqual(missed, { type: 'terminal', status: 'skipped_stale', reason: STALE_REASON });
  });

  it('counts a live reservation from another song toward the cap', () => {
    const times = capPostTimes({
      nowMs: NOW,
      songId: 'song-b',
      posted: [
        { songId: 'song-1', atMs: NOW - 10 * HOUR },
        { songId: 'song-2', atMs: NOW - 6 * HOUR },
      ],
      reservations: [{ songId: 'song-a', atMs: NOW - 60 * 1000 }],
    });
    const decision = evaluatePostCap({ nowMs: NOW, readyAtMs: NOW, postedAtMs: times });
    assert.equal(decision.action, 'defer');
  });

  it('uses the earliest audio version as ready time', () => {
    assert.equal(
      songAudioReadyAtMs(
        [
          { hasAudio: false, createdAtMs: NOW - 5 * HOUR },
          { hasAudio: true, createdAtMs: NOW - HOUR },
          { hasAudio: true, createdAtMs: NOW - 2 * HOUR },
        ],
        [NOW]
      ),
      NOW - 2 * HOUR
    );
    assert.equal(songAudioReadyAtMs([{ hasAudio: false, createdAtMs: NOW }], [NOW - 10]), null);
  });
});

describe('blocklist and compose', () => {
  it('blocks slurs, threats, and coin talk', () => {
    assert.equal(xBlocklistHit('a night in scunthorpe'), null);
    assert.equal(xBlocklistHit('kill the lights'), null);
    assert.equal(xBlocklistHit('n1gger'), 'objectionable');
    assert.equal(xBlocklistHit('I will kill you'), 'violence');
    assert.equal(xBlocklistHit('going to shoot them'), 'violence');
    for (const term of ['coin', 'token', 'crypto', 'pump', 'airdrop', 'presale', 'contract', 'CA', '$SS']) {
      assert.equal(xPostBlocked(`listen to this ${term}`), true, term);
    }
    assert.equal(xPostBlocked('contraction'), false);
    assert.equal(xPostBlocked('pumpkin spice'), false);
    assert.equal(decideXCover({ openReports: true, moderationFlagged: false, imageModeration: 'none' }), 'block');
    assert.equal(decideXCover({ openReports: false, moderationFlagged: true, imageModeration: 'none' }), 'block');
    assert.equal(decideXCover({ openReports: false, moderationFlagged: false, imageModeration: 'flag' }), 'block');
    assert.equal(decideXCover({ openReports: false, moderationFlagged: false, imageModeration: 'pass' }), 'attach');
    assert.equal(decideXCover({ openReports: false, moderationFlagged: false, imageModeration: 'none' }), 'omit');
  });

  it('strips @mentions and cashtags and keeps the share url', () => {
    assert.equal(stripXMentions('hi @friend $SS #$COIN'), 'hi friend');
    assert.equal(stripXMentions('hello @pal').includes('@'), false);
    const outputs: string[] = [];
    for (let i = 0; i < 12; i++) {
      const text = composeSongLivePost({
        artistName: '@Nova',
        lore: 'Hello @friend. Bring the $SS.',
        styleDNA: DNA,
        songTitle: 'Night @bus',
        songUrl: 'https://streamstar.xyz/songs/song-1',
        recentPostTexts: [],
        songId: `song-${i}`,
      });
      assert.equal(text.includes('@'), false, text);
      assert.equal(text.includes('$'), false, text);
      assert.match(text, /https:\/\/streamstar\.xyz\/songs\/song-1$/);
      outputs.push(text);
    }
    assert.equal(outputs.some(text => text.includes('friend')), true);
    const url = songSharePageUrl('song-1');
    assert.match(url, /\/songs\/song-1$/);
    assert.equal(existsSync('app/songs/[id]/twitter-image/route.ts'), true);
  });
});

describe('x_post funnel', () => {
  it('is a server repeat event with songId and artistId', async () => {
    assert.equal(isFunnelEvent('x_post'), true);
    assert.equal(isClientFunnelEvent('x_post'), false);
    const memory = memoryStore();
    setFunnelStoreForTests(memory.store);
    try {
      const first = await trackFunnelEvent('alice', 'x_post', { songId: 'song-1', artistId: 'artist-1' }, 'unknown');
      const second = await trackFunnelEvent('alice', 'x_post', { songId: 'song-2', artistId: 'artist-1' }, 'unknown');
      assert.equal(first.created, true);
      assert.equal(second.created, true);
      assert.equal(memory.list().length, 2);
      assert.deepEqual(memory.list()[0]?.data.props, { songId: 'song-1', artistId: 'artist-1' });
      assert.equal(memory.list().every(row => row.data.event === 'x_post'), true);
    } finally {
      setFunnelStoreForTests(null);
    }
  });
});

describe('auto-post status line', () => {
  const clock = () => '5:40 PM';

  it('names the deferred song, the drop, and the last post', () => {
    assert.deepEqual(
      xAutoPostStatusLine({
        paused: false,
        autoPost: true,
        username: 'nova',
        lastPostedAt: NOW - 2 * HOUR,
        pendingTitle: 'Night Bus',
        pendingNotBeforeMs: NOW + HOUR,
        lastSkippedTitle: 'Old',
        nowMs: NOW,
        formatClock: clock,
      }),
      { tone: 'deferred', text: 'Night Bus posts after 5:40 PM' }
    );
    assert.deepEqual(
      xAutoPostStatusLine({
        paused: false,
        autoPost: true,
        username: 'nova',
        lastPostedAt: null,
        pendingTitle: null,
        pendingNotBeforeMs: null,
        lastSkippedTitle: 'Night Bus',
        nowMs: NOW,
        formatClock: clock,
      }),
      { tone: 'skipped', text: 'Night Bus skipped (daily limit)' }
    );
    assert.equal(formatPostedAgo(NOW - 2 * HOUR, NOW), '2h ago');
    assert.deepEqual(
      xAutoPostStatusLine({
        paused: false,
        autoPost: true,
        username: 'nova',
        lastPostedAt: NOW - 2 * HOUR,
        pendingTitle: null,
        pendingNotBeforeMs: null,
        lastSkippedTitle: null,
        nowMs: NOW,
      }),
      { tone: 'posted', text: 'Last posted 2h ago · @nova' }
    );
    assert.equal(
      xAutoPostStatusLine({
        paused: true,
        autoPost: true,
        username: 'nova',
        lastPostedAt: NOW,
        pendingTitle: 'Night Bus',
        pendingNotBeforeMs: NOW,
        lastSkippedTitle: null,
        nowMs: NOW,
      }).text,
      'Reconnect X'
    );
    assert.equal(isXAuthPaused({ status: 'paused', lastError: 'X authentication failed. Reconnect this artist’s X account.' }), true);
    assert.equal(isXAuthPaused({ status: 'paused', lastError: 'X rate-limited this account.' }), false);
    assert.deepEqual(
      xAutoPostStatusLine({
        paused: false,
        autoPost: false,
        username: 'nova',
        lastPostedAt: NOW - 2 * HOUR,
        pendingTitle: null,
        pendingNotBeforeMs: null,
        lastSkippedTitle: null,
        nowMs: NOW,
      }),
      { tone: 'handle', text: '@nova', href: 'https://x.com/nova' }
    );
    assert.deepEqual(
      xAutoPostStatusLine({
        paused: false,
        autoPost: true,
        username: 'nova',
        lastPostedAt: null,
        pendingTitle: null,
        pendingNotBeforeMs: null,
        lastSkippedTitle: null,
        nowMs: NOW,
      }),
      { tone: 'handle', text: '@nova', href: 'https://x.com/nova' }
    );
  });
});

describe('auto-post row', () => {
  it('is one owner control with the ice switch and no coin copy', () => {
    const off = renderToStaticMarkup(
      createElement(XAutoPostRow, {
        connected: true,
        paused: false,
        autoPost: false,
        busy: false,
        status: { tone: 'handle', text: '@nova', href: 'https://x.com/nova' },
        error: null,
        onToggle() {},
        onConnect() {},
        onDisconnect() {},
      })
    );
    assert.match(off, /Auto-post new songs to X/);
    assert.match(off, /Up to 3 a day/);
    assert.match(off, /aria-checked="false"/);
    assert.match(off, /data-on="false"/);
    assert.match(off, /class="x-auto-handle"/);
    assert.match(off, /href="https:\/\/x.com\/nova"/);
    assert.match(off, />@nova</);
    assert.match(off, /class="x-auto-disconnect"/);
    assert.match(off, />Disconnect</);
    assert.doesNotMatch(off, /coin|token|crypto|pump|lime/i);

    const on = renderToStaticMarkup(
      createElement(XAutoPostRow, {
        connected: true,
        paused: false,
        autoPost: true,
        busy: false,
        status: { tone: 'posted', text: 'Last posted 2h ago · @nova' },
        error: null,
        onToggle() {},
        onConnect() {},
        onDisconnect() {},
      })
    );
    assert.match(on, /data-on="true"/);
    assert.match(on, /Last posted 2h ago/);

    const connect = renderToStaticMarkup(
      createElement(XAutoPostRow, {
        connected: false,
        paused: false,
        autoPost: false,
        busy: false,
        status: { tone: 'none', text: '' },
        error: null,
        onToggle() {},
        onConnect() {},
        onDisconnect() {},
      })
    );
    assert.match(connect, /Connect X/);
    assert.doesNotMatch(connect, /role="switch"/);
    assert.doesNotMatch(connect, /Disconnect/);

    const paused = renderToStaticMarkup(
      createElement(XAutoPostRow, {
        connected: true,
        paused: true,
        autoPost: true,
        busy: false,
        status: { tone: 'reconnect', text: 'Reconnect X' },
        error: null,
        onToggle() {},
        onConnect() {},
        onDisconnect() {},
      })
    );
    assert.match(paused, /Reconnect X/);
    assert.match(paused, /data-on="false"/);
    assert.match(paused, /class="x-auto-disconnect"/);
    assert.doesNotMatch(paused, /role="switch"/);

    const skipped = renderToStaticMarkup(
      createElement(XAutoPostRow, {
        connected: true,
        paused: false,
        autoPost: true,
        busy: false,
        status: { tone: 'skipped', text: 'Night Bus skipped (daily limit)' },
        error: null,
        onToggle() {},
        onConnect() {},
        onDisconnect() {},
      })
    );
    assert.match(skipped, /x-auto-status is-skipped/);
    assert.match(skipped, /Night Bus skipped \(daily limit\)/);

    const css = readFileSync('components/artists/owner-panel.css', 'utf8');
    assert.match(css, /\.x-auto-row[\s\S]*min-height:\s*48px/);
    assert.match(css, /\.x-auto-switch[\s\S]*width:\s*44px/);
    assert.match(css, /\.x-auto-switch[\s\S]*height:\s*24px/);
    assert.match(css, /\.x-auto-switch[\s\S]*border-radius:\s*12px/);
    assert.match(css, /background:\s*#2A2A38/);
    assert.match(css, /background:\s*#E8E6F2/);
    assert.match(css, /background:\s*#0A0A10/);
    assert.match(css, /background:\s*#8B8896/);
    assert.match(css, /\.x-auto-reconnect\s*\{[^}]*min-height:\s*44px/);
    assert.match(css, /\.x-auto-reconnect[\s\S]*color:\s*#FF4D6A/);
    assert.match(css, /\.x-auto-handle\s*\{[^}]*color:\s*#8B8896/);
    assert.match(css, /\.x-auto-status\.is-skipped[\s\S]*color:\s*#8B8896/);
    const panel = readFileSync('components/artists/ArtistXPanel.tsx', 'utf8');
    assert.match(panel, /\/api\/x\/disconnect/);
    assert.match(
      panel,
      /Disconnect X for this artist\? Posting will stop until you connect again\./
    );
    assert.doesNotMatch(css.slice(css.indexOf('.x-auto-row')), /#C8F542|#6ee7b7|lime/i);
  });
});
