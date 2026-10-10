import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { createRequire } from 'node:module';
import {
  VIEWER_COOKIE,
  VIEWER_COOKIE_MAX_AGE,
  viewerCookieMaxAge,
  viewerCookieOptions,
} from '../lib/auth/viewerCookie';
import { hiddenArtistPageMetadata } from '../lib/artists/visibility';
import { rejectHiddenArtist } from '../lib/artists/pageGate';
import { setAdminDbForTests } from '../lib/firebase/admin';
import { setViewerVerifierForTests } from '../lib/server/viewer';
import { GET as getArtist } from '../app/api/artists/[id]/route';
import { POST as postBatch } from '../app/api/artists/batch/route';
import { PATCH as patchName } from '../app/api/artists/[id]/name/route';
import { POST as postViewer, DELETE as deleteViewer } from '../app/api/auth/viewer/route';

const require = createRequire(import.meta.url);
const { VIEWER_CACHE_CONTROL, VIEWER_NO_STORE_SOURCES } = require('../lib/http/viewerNoStoreSources');
const { getPathMatch } = require('next/dist/shared/lib/router/utils/path-match');

const FACE = 'https://cdn.example/private-face.jpg';
const PRIVATE = {
  id: 'Far2rKTQV98sbAf1iqxw',
  name: 'Hidden Band',
  lore: 'Secret bio that must not leak',
  avatarURL: FACE,
  ownerId: 'alice',
  isPublic: false,
  deletedAt: null,
};

const NO_STORE_ROUTES = [
  'app/artists/[id]/page.tsx',
  'app/api/artists/[id]/route.ts',
  'app/api/artists/batch/route.ts',
  'app/api/artists/followed/route.ts',
  'app/api/artists/[id]/name/route.ts',
  'app/api/artists/[id]/bio/route.ts',
  'app/api/auth/viewer/route.ts',
  'app/api/x/connect/route.ts',
  'app/api/x/pause/route.ts',
  'app/api/x/disconnect/route.ts',
  'app/api/x/artists/[id]/route.ts',
  'app/api/me/holdings/route.ts',
  'app/api/account/route.ts',
  'app/api/comments/route.ts',
  'app/api/conversations/route.ts',
  'app/api/conversations/[id]/route.ts',
  'app/api/conversations/[id]/messages/route.ts',
  'app/api/songs/[id]/route.ts',
  'app/api/users/link-wallet/route.ts',
  'app/api/generations/[id]/status/route.ts',
  'app/api/generations/musicgpt/route.ts',
  'app/api/artists/looks/route.ts',
  'app/api/artists/looks/upload/route.ts',
  'app/api/artists/pump-fun/metadata/route.ts',
  'app/api/artists/pump-fun/create-tx/route.ts',
  'app/api/artists/[id]/pump-fun/route.ts',
  'app/api/webhooks/musicgpt/simulate/route.ts',
  'app/api/covers/generate/route.ts',
  'app/api/covers/backfill/route.ts',
];

const MUTATIONS = [
  'app/api/artists/batch/route.ts',
  'app/api/artists/[id]/name/route.ts',
  'app/api/artists/[id]/bio/route.ts',
  'app/api/x/connect/route.ts',
  'app/api/x/pause/route.ts',
  'app/api/x/disconnect/route.ts',
];

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function artistDb(artist: typeof PRIVATE | null) {
  return {
    collection() {
      return {
        doc(id: string) {
          return {
            async get() {
              if (!artist || artist.id !== id) {
                return { exists: false, id, data: () => undefined };
              }
              return { exists: true, id, data: () => artist };
            },
          };
        },
      };
    },
  };
}

function cookieRequest(url: string, method: string, token: string | null, body?: string): NextRequest {
  const headers = new Headers();
  if (token) headers.set('cookie', `${VIEWER_COOKIE}=${token}`);
  if (body) headers.set('content-type', 'application/json');
  return new NextRequest(url, { method, headers, body });
}

function bearerRequest(url: string, method: string, token: string, body?: string): NextRequest {
  const headers = new Headers({ authorization: `Bearer ${token}` });
  if (body) headers.set('content-type', 'application/json');
  return new NextRequest(url, { method, headers, body });
}

function pageStatus(
  artist: typeof PRIVATE | null,
  viewerId: string | null
): number {
  try {
    rejectHiddenArtist(artist, viewerId);
    return 200;
  } catch (error) {
    const digest =
      error && typeof error === 'object' && 'digest' in error
        ? String((error as { digest?: unknown }).digest)
        : '';
    if (digest === 'NEXT_NOT_FOUND') return 404;
    throw error;
  }
}

function headerMatches(source: string, pathname: string): boolean {
  return Boolean(getPathMatch(source, { strict: true })(pathname));
}

describe('ss_viewer cookie', () => {
  after(() => {
    setAdminDbForTests(null);
    setViewerVerifierForTests(null);
  });

  it('is HttpOnly, Secure, SameSite=Lax, Path=/, and at most one hour', () => {
    const now = 1_700_000_000_000;
    const options = viewerCookieOptions(viewerCookieMaxAge(now / 1000 + 7200, now));
    assert.equal(options.httpOnly, true);
    assert.equal(options.secure, true);
    assert.equal(options.sameSite, 'lax');
    assert.equal(options.path, '/');
    assert.equal(options.maxAge, VIEWER_COOKIE_MAX_AGE);
    assert.equal(viewerCookieMaxAge(now / 1000 + 1800, now), 1800);
    assert.equal(viewerCookieMaxAge(now / 1000 - 5, now), 0);
    assert.equal(viewerCookieMaxAge(undefined, now), 0);
    assert.equal(read('lib/auth/viewerCookie.ts').includes('document.cookie'), false);
  });

  it('sets the cookie from a Bearer token and clears it without one', async () => {
    const now = Date.now();
    setViewerVerifierForTests(async token => {
      if (token !== 'owner-token') return null;
      return { uid: 'alice', exp: Math.floor(now / 1000) + 1800 };
    });

    const posted = await postViewer(
      bearerRequest('https://streamstar.xyz/api/auth/viewer', 'POST', 'owner-token')
    );
    assert.equal(posted.status, 200);
    assert.equal(posted.headers.get('cache-control'), VIEWER_CACHE_CONTROL);
    const setCookie = posted.headers.get('set-cookie') || '';
    assert.match(setCookie, new RegExp(`${VIEWER_COOKIE}=`));
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\//);
    const maxAge = Number(setCookie.match(/Max-Age=(\d+)/i)?.[1]);
    assert.equal(maxAge > 0 && maxAge <= VIEWER_COOKIE_MAX_AGE, true);

    const cookieOnly = await postViewer(
      cookieRequest('https://streamstar.xyz/api/auth/viewer', 'POST', 'owner-token')
    );
    assert.equal(cookieOnly.status, 401);
    assert.equal((cookieOnly.headers.get('set-cookie') || '').includes('Max-Age=1800'), false);

    const cleared = await deleteViewer();
    assert.equal(cleared.status, 200);
    const clearCookie = cleared.headers.get('set-cookie') || '';
    assert.match(clearCookie, /Max-Age=0/);
    assert.match(clearCookie, /HttpOnly/i);
    assert.match(clearCookie, /Secure/);
    assert.match(clearCookie, /SameSite=Lax/i);
    assert.match(clearCookie, /Path=\//);
    assert.equal(cleared.headers.get('cache-control'), VIEWER_CACHE_CONTROL);
  });
});

describe('viewer cache and private artist 404', () => {
  after(() => {
    setAdminDbForTests(null);
    setViewerVerifierForTests(null);
  });

  it('returns HTTP 404 for a signed-out viewer and a non-owner, with no private meta', () => {
    for (const viewerId of [null, 'bob']) {
      assert.equal(pageStatus(PRIVATE, viewerId), 404);
    }
    assert.equal(pageStatus(PRIVATE, 'alice'), 200);
    assert.equal(pageStatus({ ...PRIVATE, isPublic: true }, null), 200);

    const meta = JSON.stringify(hiddenArtistPageMetadata());
    assert.equal(meta.includes('Hidden Band'), false);
    assert.equal(meta.includes('Secret bio'), false);
    assert.equal(meta.includes(FACE), false);
    assert.equal(meta.includes('alice'), false);
    assert.equal(hiddenArtistPageMetadata().openGraph.images.length, 0);

    const page = read('app/artists/[id]/page.tsx');
    const notFound = read('app/artists/[id]/not-found.tsx');
    assert.match(page, /rejectHiddenArtist\(/);
    assert.match(page, /hiddenArtistPageMetadata\(/);
    assert.equal(notFound.includes("'use client'"), false);
    assert.match(notFound, /This artist isn't on Streamstar\./);
    assert.match(read('app/artists/[id]/ArtistNotFoundRecovery.tsx'), /\/api\/auth\/viewer/);
  });

  it('serves the owner on GET with only the cookie, and 404s everyone else without caching', async () => {
    setAdminDbForTests(artistDb(PRIVATE));
    setViewerVerifierForTests(async token =>
      token === 'owner-token' ? { uid: 'alice', exp: Math.floor(Date.now() / 1000) + 600 } : null
    );

    const owner = await getArtist(
      cookieRequest('https://streamstar.xyz/api/artists/Far2rKTQV98sbAf1iqxw', 'GET', 'owner-token'),
      { params: { id: PRIVATE.id } }
    );
    assert.equal(owner.status, 200);
    assert.equal(owner.headers.get('cache-control'), VIEWER_CACHE_CONTROL);
    const ownerBody = await owner.json();
    assert.equal(ownerBody.artist.name, 'Hidden Band');

    const stranger = await getArtist(
      cookieRequest('https://streamstar.xyz/api/artists/Far2rKTQV98sbAf1iqxw', 'GET', null),
      { params: { id: PRIVATE.id } }
    );
    assert.equal(stranger.status, 404);
    assert.equal(stranger.headers.get('cache-control'), VIEWER_CACHE_CONTROL);
    const strangerBody = JSON.stringify(await stranger.json());
    assert.equal(strangerBody.includes('Hidden Band'), false);
    assert.equal(strangerBody.includes('Secret bio'), false);
    assert.equal(strangerBody.includes(FACE), false);
    assert.equal(strangerBody.includes('alice'), false);
  });

  it('rejects a name change and a batch read that send only the cookie', async () => {
    setAdminDbForTests(artistDb(PRIVATE));
    setViewerVerifierForTests(async token =>
      token === 'owner-token' ? { uid: 'alice', exp: Math.floor(Date.now() / 1000) + 600 } : null
    );

    const name = await patchName(
      cookieRequest(
        'https://streamstar.xyz/api/artists/Far2rKTQV98sbAf1iqxw/name',
        'PATCH',
        'owner-token',
        JSON.stringify({ name: 'Renamed' })
      ),
      { params: { id: PRIVATE.id } }
    );
    assert.equal(name.status, 401);
    assert.equal(name.headers.get('cache-control'), VIEWER_CACHE_CONTROL);
    const nameBody = JSON.stringify(await name.json());
    assert.equal(nameBody.includes('Hidden Band'), false);
    assert.equal(nameBody.includes('Renamed'), false);

    const batch = await postBatch(
      cookieRequest(
        'https://streamstar.xyz/api/artists/batch',
        'POST',
        'owner-token',
        JSON.stringify({ artistIds: [PRIVATE.id] })
      )
    );
    assert.equal(batch.status, 401);
    assert.equal(batch.headers.get('cache-control'), VIEWER_CACHE_CONTROL);
  });

  it('marks viewer-varying routes force-dynamic, revalidate 0, and private no-store', async () => {
    for (const file of NO_STORE_ROUTES) {
      const source = read(file);
      assert.match(source, /export const dynamic = 'force-dynamic'/);
      assert.match(source, /export const revalidate = 0/);
      assert.match(source, /export const fetchCache = 'force-no-store'/);
    }

    for (const file of MUTATIONS) {
      const source = read(file);
      assert.equal(source.includes('verifiedViewerIdFromRequest'), false);
      assert.equal(source.includes('VIEWER_COOKIE'), false);
      assert.match(source, /requireUserId/);
    }
    assert.match(read('app/api/artists/followed/route.ts'), /verifiedViewerIdFromRequest/);
    assert.match(read('app/api/artists/[id]/route.ts'), /verifiedViewerIdFromRequest/);

    const nextConfig = require('../next.config.js');
    const rules = await nextConfig.headers();
    const bySource = new Map(rules.map((rule: { source: string }) => [rule.source, rule]));
    for (const source of VIEWER_NO_STORE_SOURCES) {
      const rule = bySource.get(source) as { headers: { key: string; value: string }[] } | undefined;
      assert.ok(rule, source);
      const cache = rule.headers.find(header => header.key === 'Cache-Control');
      assert.equal(cache?.value, 'private, no-store');
    }

    const covered = (pathname: string) =>
      VIEWER_NO_STORE_SOURCES.some((source: string) => headerMatches(source, pathname));
    assert.equal(covered('/artists/Far2rKTQV98sbAf1iqxw'), true);
    assert.equal(covered('/api/artists/Far2rKTQV98sbAf1iqxw'), true);
    assert.equal(covered('/api/artists/batch'), true);
    assert.equal(covered('/api/artists/followed'), true);
    assert.equal(covered('/api/artists/Far2rKTQV98sbAf1iqxw/name'), true);
    assert.equal(covered('/api/auth/viewer'), true);
    assert.equal(covered('/api/artists/search'), false);
    assert.equal(covered('/api/artists/display'), false);
    assert.equal(covered('/api/artists/Far2rKTQV98sbAf1iqxw/coin-quote'), false);
    assert.equal(covered('/songs/song-1'), false);
  });

  it('keeps public song pages free of viewer identity in the server render', () => {
    const song = read('app/songs/[id]/page.tsx');
    assert.match(song, /export const dynamic = 'force-dynamic'/);
    assert.equal(song.includes('ss_viewer'), false);
    assert.equal(song.includes('verifiedViewer'), false);
    assert.equal(song.includes('VIEWER_COOKIE'), false);
    assert.equal(song.includes('cookies('), false);
    assert.equal(song.includes('authorization'), false);
    assert.equal(song.includes('requireUser'), false);
    assert.equal(read('app/page.tsx').includes('ss_viewer'), false);
    assert.equal(read('app/artists/page.tsx').includes('ss_viewer'), false);
  });
});
