import './render-setup';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { setAdminDbForTests } from '../lib/firebase/admin';
import {
  artistPageFaceSong,
  selectArtistPageSongs,
  shouldRefreshOwnerCatalog,
  songShowsPrivateTag,
} from '../lib/artists/ownerSongs';
import { adminListOwnerArtistSongs } from '../lib/server/songsAdmin';

process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-key';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'test-project';
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = '1:1:web:test';

const ARTIST = 'artist-1';
const OWNER = 'alice';

function song(partial: {
  id: string;
  title: string;
  isPublic: boolean;
  createdAt: number;
  ownerId?: string;
  artistId?: string;
  deletedAt?: unknown;
}) {
  return {
    id: partial.id,
    title: partial.title,
    isPublic: partial.isPublic,
    createdAt: partial.createdAt,
    ownerId: partial.ownerId ?? OWNER,
    artistId: partial.artistId ?? ARTIST,
    deletedAt: partial.deletedAt ?? null,
    artistVersionId: 'av',
    currentVersionId: 'ver',
    duration: null,
    coverPosterUrl: null,
    albumCoverThumbnail: null,
    albumCoverPath: null,
  };
}

const publicSong = song({
  id: 'public',
  title: 'On the radio',
  isPublic: true,
  createdAt: 10,
});
const privateSong = song({
  id: 'private',
  title: 'Unreleased',
  isPublic: false,
  createdAt: 20,
});
const olderPrivate = song({
  id: 'older-private',
  title: 'Demo',
  isPublic: false,
  createdAt: 5,
});

async function renderSongs(
  songs: ReturnType<typeof song>[],
  ownerCatalog: boolean
) {
  const [{ SongCard }, { SongPlayerStaticProvider }] = await Promise.all([
    import('../components/songs/SongCard'),
    import('../components/songs/SongPlayerProvider'),
  ]);
  return renderToStaticMarkup(
    createElement(
      SongPlayerStaticProvider,
      null,
      createElement(
        'div',
        null,
        songs.map(item =>
          createElement(SongCard, {
            key: item.id,
            song: item as never,
            artistName: 'L.E.G',
            ownerCatalog,
          })
        )
      )
    )
  );
}

function songDb(rows: Array<Record<string, unknown>>) {
  const queries: string[][] = [];
  function chain(filters: Array<{ field: string; value: unknown }>) {
    const api = {
      where(field: string, _op: string, value: unknown) {
        return chain([...filters, { field, value }]);
      },
      orderBy() {
        return api;
      },
      limit() {
        return api;
      },
      async get() {
        queries.push(filters.map(filter => filter.field));
        const matched = rows.filter(row =>
          filters.every(filter => row[filter.field] === filter.value)
        );
        return { docs: matched.map(data => ({ data: () => data })) };
      },
    };
    return api;
  }
  return {
    db: { collection: () => chain([]) },
    queries: () => queries,
  };
}

describe('artist page song visibility', () => {
  after(() => {
    setAdminDbForTests(null);
  });

  it('shows the owner public and private songs, newest first, with the tag only on private', async () => {
    const visible = selectArtistPageSongs(
      [publicSong, privateSong, olderPrivate],
      OWNER,
      OWNER,
      ARTIST
    );
    assert.deepEqual(
      visible.map(item => item.id),
      ['private', 'public', 'older-private']
    );
    assert.equal(songShowsPrivateTag(visible[0], true), true);
    assert.equal(songShowsPrivateTag(visible[1], true), false);
    assert.equal(songShowsPrivateTag(visible[2], true), true);

    const html = await renderSongs(visible, true);
    assert.match(html, /Unreleased/);
    assert.match(html, /On the radio/);
    assert.match(html, /Demo/);
    assert.equal(html.split('private-song-tag').length - 1, 2);
    assert.match(html, /aria-label="Private, only you can see this song"/);
    assert.match(html, /lucide-lock/);
    assert.doesNotMatch(html, /eye-off|EyeOff/i);
    assert.match(html, /min-w-0[\s\S]{0,180}Unreleased[\s\S]{0,400}private-song-tag/);
    assert.match(html, /truncate[^>]*>Unreleased/);
  });

  it('hides private songs and the tag from a non-owner and from a signed-out viewer', async () => {
    for (const viewerId of [null, 'bob']) {
      const visible = selectArtistPageSongs(
        [publicSong, privateSong, olderPrivate],
        viewerId,
        OWNER,
        ARTIST
      );
      assert.deepEqual(
        visible.map(item => item.title),
        ['On the radio']
      );
      assert.equal(visible.some(item => item.isPublic !== true), false);
      const html = await renderSongs(visible, false);
      assert.match(html, /On the radio/);
      assert.equal(html.includes('Unreleased'), false);
      assert.equal(html.includes('Demo'), false);
      assert.equal(html.includes('private-song-tag'), false);
      assert.equal(html.includes('Private, only you can see this song'), false);
    }
  });

  it('does not tag a private song unless the surface is the owner catalog', async () => {
    const html = await renderSongs([privateSong], false);
    assert.match(html, /Unreleased/);
    assert.equal(html.includes('private-song-tag'), false);
    assert.equal(html.includes('Private, only you can see this song'), false);
  });

  it('keeps an owner who only has private songs off the empty state', () => {
    const visible = selectArtistPageSongs([privateSong], OWNER, OWNER, ARTIST);
    assert.equal(visible.length, 1);
    assert.equal(visible[0].title, 'Unreleased');
    const signedOut = selectArtistPageSongs([privateSong], null, OWNER, ARTIST);
    assert.equal(signedOut.length, 0);
    const page = readFileSync('app/artists/[id]/page.tsx', 'utf8');
    const selected = page.indexOf('selectArtistPageSongs(');
    const empty = page.indexOf('No songs yet.');
    assert.equal(selected > 0 && selected < empty, true);
    assert.match(page, /songs\.length > 0/);
  });

  it('drops deleted songs and songs owned by someone else', () => {
    const visible = selectArtistPageSongs(
      [
        privateSong,
        song({
          id: 'gone',
          title: 'Deleted',
          isPublic: false,
          createdAt: 30,
          deletedAt: 1,
        }),
        song({
          id: 'stranger',
          title: 'Not yours',
          isPublic: false,
          createdAt: 40,
          ownerId: 'bob',
        }),
        song({
          id: 'other-artist',
          title: 'Other artist',
          isPublic: true,
          createdAt: 50,
          artistId: 'artist-2',
        }),
      ],
      OWNER,
      OWNER,
      ARTIST
    );
    assert.deepEqual(
      visible.map(item => item.id),
      ['private']
    );
  });

  it('uses a public cover for the hero and a private cover only for the owner', () => {
    const songs = [privateSong, publicSong];
    assert.equal(artistPageFaceSong(songs, true)?.id, 'public');
    assert.equal(artistPageFaceSong(songs, false)?.id, 'public');
    assert.equal(artistPageFaceSong([privateSong], false), null);
    assert.equal(artistPageFaceSong([privateSong], true)?.id, 'private');
  });

  it('refreshes the owner catalog only for the owner before private songs are included', () => {
    assert.equal(shouldRefreshOwnerCatalog(false, OWNER, OWNER), true);
    assert.equal(shouldRefreshOwnerCatalog(true, OWNER, OWNER), false);
    assert.equal(shouldRefreshOwnerCatalog(false, 'bob', OWNER), false);
    assert.equal(shouldRefreshOwnerCatalog(false, null, OWNER), false);
  });

  it('loads owner songs with an owner-constrained admin query', async () => {
    const fake = songDb([
      publicSong,
      privateSong,
      song({
        id: 'other',
        title: 'Elsewhere',
        isPublic: false,
        createdAt: 99,
        artistId: 'artist-2',
      }),
    ]);
    setAdminDbForTests(fake.db);
    const songs = await adminListOwnerArtistSongs(ARTIST, OWNER);
    assert.deepEqual(fake.queries()[0], ['artistId', 'ownerId']);
    assert.deepEqual(
      songs.map(item => item.id),
      ['private', 'public']
    );
  });

  it('wires the owner fetch, plain props, and studio tags without tagging fan lists', () => {
    const page = readFileSync('app/artists/[id]/page.tsx', 'utf8');
    assert.match(page, /adminListOwnerArtistSongs\(artist\.id, artist\.ownerId\)/);
    assert.match(page, /getArtistSongs\(artist\.id, 20\)/);
    assert.match(page, /artistPageClientProps\(/);
    assert.match(page, /ownerCatalog=\{ownerView\}/);
    assert.match(page, /OwnerSongListRecovery/);
    assert.match(readFileSync('components/dashboard/SongsTab.tsx', 'utf8'), /ownerCatalog/);
    assert.match(readFileSync('components/dashboard/OverviewTab.tsx', 'utf8'), /ownerCatalog/);
    assert.equal(readFileSync('components/feed/FeedPageClient.tsx', 'utf8').includes('ownerCatalog'), false);
    assert.equal(readFileSync('components/discover/DiscoverSongCard.tsx', 'utf8').includes('PrivateSongTag'), false);

    const css = readFileSync('components/songs/private-song-tag.css', 'utf8');
    assert.match(css, /rgba\(232, 230, 242, 0\.6\)/);
    assert.match(css, /#2A2A38/);
    assert.match(css, /border-radius:\s*12px/);
    assert.match(css, /font-size:\s*11px/);
    assert.match(css, /height:\s*20px/);
    assert.match(css, /padding:\s*0 6px/);
    assert.match(css, /font-family:\s*var\(--font-figtree\)/);
    assert.match(css, /background:\s*transparent/);
    assert.match(css, /flex-shrink:\s*0/);
    assert.doesNotMatch(css, /lime|red|#CEFF00|#FF/i);
    assert.match(readFileSync('components/songs/PrivateSongTag.tsx', 'utf8'), /Lock/);
    assert.equal(
      readFileSync('components/songs/PrivateSongTag.tsx', 'utf8').includes('Eye'),
      false
    );
  });
});
