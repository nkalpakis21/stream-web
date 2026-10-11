import './render-setup';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotFoundRecoveryShell } from '../components/states/NotFoundRecoveryShell';
import { ConnectXToggle } from '../components/artists/ConnectXToggle';
import { XConnectConfigProvider } from '../components/artists/XConnectConfig';
import { StudioArtistTile } from '../components/dashboard/StudioArtistTile';
import { authHref, getSafeReturnTo } from '../lib/auth/returnTo';
import {
  RECOVERY_REVEAL_MS,
  SIGNED_IN_HINT_KEY,
  SIGNED_IN_HINT_SCRIPT,
  SIGNED_IN_HINT_VALUE,
  recoveryDecision,
  recoveryStorageKey,
  syncSignedInHint,
} from '../lib/auth/notFoundRecovery';
import type { AIArtistDocument } from '../types/firestore';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('owner not-found recovery', () => {
  it('reloads once for an owner and never for anyone else', () => {
    assert.equal(
      recoveryDecision({ responseOk: true, alreadyRecovered: false }),
      'reload'
    );
    assert.equal(
      recoveryDecision({ responseOk: true, alreadyRecovered: true }),
      'show-not-found'
    );
    assert.equal(
      recoveryDecision({ responseOk: false, alreadyRecovered: false }),
      'show-not-found'
    );
    assert.equal(
      recoveryDecision({ responseOk: false, alreadyRecovered: true }),
      'show-not-found'
    );
    assert.equal(recoveryStorageKey('song', 'song-1'), 'ss_recover:song:song-1');
    assert.equal(recoveryStorageKey('artist', 'art-1'), 'ss_recover:artist:art-1');
    assert.equal(RECOVERY_REVEAL_MS, 2000);
  });

  it('stores a presence flag only', () => {
    const writes = new Map<string, string>();
    const storage = {
      setItem(key: string, value: string) {
        writes.set(key, value);
      },
      removeItem(key: string) {
        writes.delete(key);
      },
      getItem(key: string) {
        return writes.get(key) ?? null;
      },
    };
    syncSignedInHint(storage, true);
    assert.equal(storage.getItem(SIGNED_IN_HINT_KEY), SIGNED_IN_HINT_VALUE);
    assert.equal(SIGNED_IN_HINT_VALUE, '1');
    assert.equal(JSON.stringify([...writes.entries()]).includes('uid'), false);
    assert.equal(SIGNED_IN_HINT_SCRIPT.includes('uid'), false);
    assert.equal(SIGNED_IN_HINT_SCRIPT.includes('token'), false);
    assert.match(SIGNED_IN_HINT_SCRIPT, /data-ss-signed-in/);
    syncSignedInHint(storage, false);
    assert.equal(storage.getItem(SIGNED_IN_HINT_KEY), null);
  });

  it('keeps the 404 copy in server HTML and the spinner behind the signed-in hint', () => {
    const html = renderToStaticMarkup(
      createElement(NotFoundRecoveryShell, { line: "This song isn't on Streamstar." })
    );
    assert.match(html, /This song isn(?:'|&#x27;)t on Streamstar\./);
    assert.match(html, /ss-not-found-copy/);
    assert.match(html, /ss-not-found-pending/);
    assert.match(html, /ss-quiet-spinner/);
    assert.match(html, /data-ss-signed-in/);
    assert.doesNotMatch(html, /X_CLIENT|uid|Bearer/);

    const css = read('app/globals.css');
    assert.match(css, /\.ss-not-found-pending\s*\{[^}]*display:\s*none/s);
    assert.match(css, /background:\s*#0a0a10/i);
    assert.match(
      css,
      /html\[data-ss-signed-in\]:not\(\[data-ss-recover-settled\]\) \.ss-not-found-copy\s*\{[^}]*display:\s*none/s
    );

    const song = read('app/songs/[id]/not-found.tsx');
    const artist = read('app/artists/[id]/not-found.tsx');
    assert.equal(song.includes("'use client'"), false);
    assert.equal(artist.includes("'use client'"), false);
    assert.match(song, /This song isn't on Streamstar\./);
    assert.match(artist, /This artist isn't on Streamstar\./);
    assert.match(read('app/songs/[id]/SongNotFoundRecovery.tsx'), /\/api\/auth\/viewer/);
    assert.match(read('app/artists/[id]/ArtistNotFoundRecovery.tsx'), /\/api\/auth\/viewer/);
    const hook = read('components/states/useOwnerNotFoundRecovery.ts');
    assert.match(hook, /window\.location\.reload\(\)/);
    assert.match(hook, /sessionStorage/);
    assert.match(read('components/providers/AuthProvider.tsx'), /syncSignedInHint/);
    assert.equal(existsSync('app/artists/[id]/loading.tsx'), false);
    assert.equal(existsSync('app/songs/[id]/loading.tsx'), false);
  });
});

describe('signed-out return path', () => {
  it('keeps the dashboard path and query', () => {
    assert.equal(getSafeReturnTo('/dashboard'), '/dashboard');
    assert.equal(getSafeReturnTo('/dashboard?tab=songs'), '/dashboard?tab=songs');
    assert.equal(getSafeReturnTo('/create'), '/create');
    assert.equal(getSafeReturnTo('/signin'), '/discover');
    assert.equal(getSafeReturnTo('https://evil.example/dashboard'), '/discover');
    assert.equal(getSafeReturnTo('//evil.example'), '/discover');
    assert.equal(authHref('/signin', '/dashboard'), '/signin?next=%2Fdashboard');
    assert.equal(
      authHref('/signin', '/dashboard?tab=artists&new=1'),
      '/signin?next=%2Fdashboard%3Ftab%3Dartists%26new%3D1'
    );
  });
});

describe('studio face and follower line', () => {
  it('paints the hero circle for a studio artist without an avatar', () => {
    const html = renderToStaticMarkup(
      createElement(StudioArtistTile, {
        artist: {
          id: 'X3zu8PahLmbYxdbb87qK',
          name: 'Gunna',
          avatarURL: null,
        } as AIArtistDocument,
        song: {
          coverPosterUrl: 'https://cdn.example/gunna.jpg',
          albumCoverThumbnail: null,
          albumCoverPath: null,
        },
      })
    );
    assert.match(html, /artist-face-hero/);
    assert.match(html, /#14141C/);
    assert.ok(html.includes('src="https://cdn.example/gunna.jpg"'));
    assert.doesNotMatch(html, /artist-index-face-initials/);

    const bare = renderToStaticMarkup(
      createElement(StudioArtistTile, {
        artist: {
          id: 'p3',
          name: 'P3',
          avatarURL: null,
        } as AIArtistDocument,
      })
    );
    assert.match(bare, /artist-face-hero/);
    assert.match(bare, /#14141C/);
    assert.match(bare, /artist-index-face-initials/);
    assert.match(bare, />P3</);
  });

  it('reserves the follower line', () => {
    const source = read('components/artists/FollowersList.tsx');
    assert.match(source, /minHeight:\s*20/);
    assert.match(source, /lineHeight:\s*'20px'/);
    assert.match(source, /followerCount == null[\s\S]*\\u00A0/);
    assert.match(source, /typeof count === 'number'/);
    assert.match(read('app/artists/[id]/page.tsx'), /followerCount/);
    assert.match(read('lib/artists/pageProps.ts'), /followerCount/);
  });
});

describe('connect x visibility', () => {
  it('hides the create-flow card when X is not configured', () => {
    const hidden = renderToStaticMarkup(
      createElement(XConnectConfigProvider, {
        configured: false,
        children: createElement(ConnectXToggle, { checked: false, onChange() {} }),
      })
    );
    assert.equal(hidden, '');

    const shown = renderToStaticMarkup(
      createElement(XConnectConfigProvider, {
        configured: true,
        children: createElement(ConnectXToggle, { checked: false, onChange() {} }),
      })
    );
    assert.match(shown, /Connect X for this artist/);
    assert.doesNotMatch(shown, /X_CLIENT|env var/);
    assert.doesNotMatch(read('components/artists/ArtistXPanel.tsx'), /Set the X_CLIENT/);
    assert.match(read('app/artists/[id]/page.tsx'), /isXConfigured\(/);
    assert.match(read('app/dashboard/layout.tsx'), /isXConfigured\(/);
  });
});
