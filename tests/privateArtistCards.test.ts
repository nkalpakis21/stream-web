import './render-setup';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  isPermissionDenied,
  songCardsFromArtistLookups,
  type ArtistCardDisplay,
} from '../lib/artists/cardDisplay';
import { DeletedCommentLine } from '../components/comments/DeletedCommentLine';

const privateArtist: ArtistCardDisplay = {
  id: 'private-artist',
  name: 'Hidden Band',
  photoUrl: null,
  isPublic: false,
};

const publicArtist: ArtistCardDisplay = {
  id: 'public-artist',
  name: 'Nova',
  photoUrl: 'https://cdn.example/nova.jpg',
  isPublic: true,
};

function song(id: string, artistId: string) {
  return {
    id,
    ownerId: 'alice',
    artistId,
    artistVersionId: 'av',
    title: id === 'song-private' ? 'Public Track' : 'Other Track',
    isPublic: true,
    deletedAt: null,
    currentVersionId: 'ver',
    parentSongId: null,
    collaborationType: null,
    albumCoverPath: null,
    albumCoverThumbnail: null,
    coverPosterUrl: null,
    coverVideoUrl: null,
    coverMotionStatus: null,
    playCount: 1,
    duration: 90,
    createdAt: { toMillis: () => 1 },
    updatedAt: { toMillis: () => 1 },
  };
}

describe('private artist song cards', () => {
  it('keeps every song when one artist lookup is denied', () => {
    const songs = [song('song-private', 'private-artist'), song('song-public', 'public-artist')];
    const lookups = [
      { status: 'rejected' as const, reason: { code: 'permission-denied' } },
      { status: 'fulfilled' as const, value: publicArtist },
    ];
    const cards = songCardsFromArtistLookups(songs, lookups);
    assert.deepEqual(
      cards.map(card => card.id),
      ['song-private', 'song-public']
    );
    assert.equal(cards[0]?.artist, null);
    assert.equal(cards[1]?.artist?.name, 'Nova');
    assert.equal(isPermissionDenied({ code: 'permission-denied' }), true);
    assert.equal(isPermissionDenied({ code: 'firestore/permission-denied' }), true);
    assert.equal(isPermissionDenied(new Error('Missing or insufficient permissions.')), true);
    assert.equal(isPermissionDenied(new Error('offline')), false);
  });

  it('renders a private artist name and coin cluster as text, with initials', async () => {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-key';
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'test-project';
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = '1:1:web:test';

    const [{ DiscoverSongCard }, { HomeListenShell }, { SongPlayerStaticProvider }, { AuthProvider }] =
      await Promise.all([
        import('../components/discover/DiscoverSongCard'),
        import('../components/homepage/HomeListenShell'),
        import('../components/songs/SongPlayerProvider'),
        import('../components/providers/AuthProvider'),
      ]);

    const cards = songCardsFromArtistLookups(
      [song('song-private', 'private-artist'), song('song-public', 'public-artist')],
      [
        { status: 'fulfilled', value: privateArtist },
        { status: 'fulfilled', value: publicArtist },
      ]
    );

    const discover = renderToStaticMarkup(
      createElement(
        SongPlayerStaticProvider,
        null,
        createElement(
          'div',
          null,
          cards.map(card =>
            createElement(DiscoverSongCard, {
              key: card.id,
              song: card as never,
              artist: card.artist,
              artistName: card.artist?.name,
            })
          )
        )
      )
    );

    assert.match(discover, /Public Track/);
    assert.match(discover, /Other Track/);
    assert.match(discover, /Hidden Band/);
    assert.match(discover, /Nova/);
    assert.equal(discover.includes('href="/artists/private-artist"'), false);
    assert.match(discover, /href="\/artists\/public-artist"/);
    assert.match(discover, /artist-index-face-initials/);
    assert.match(discover, />HB</);

    const cover = {
      albumCoverPath: null,
      albumCoverThumbnail: null,
      coverPosterUrl: null,
      coverVideoUrl: null,
      coverMotionStatus: null,
    };
    const home = renderToStaticMarkup(
      createElement(
        AuthProvider,
        null,
        createElement(
          SongPlayerStaticProvider,
          null,
          createElement(HomeListenShell, {
            featured: {
              songId: 'song-private',
              title: 'Public Track',
              artistName: 'Hidden Band',
              artistId: 'private-artist',
              artistPhotoUrl: null,
              artistLinkable: false,
              cover,
              audioUrl: 'https://cdn.example/a.mp3',
              ticker: null,
              coinIcon: null,
              coin: null,
            },
            heat: [
              {
                id: 'song-private',
                title: 'Public Track',
                artistName: 'Hidden Band',
                artistId: 'private-artist',
                artistPhotoUrl: null,
                artistLinkable: false,
                cover,
                playCount: 3,
                ticker: null,
                coinIcon: null,
                coin: { priceUsd: 1.25, change24h: 0.1, marketCap: 1000 },
              },
              {
                id: 'song-public',
                title: 'Other Track',
                artistName: 'Nova',
                artistId: 'public-artist',
                artistPhotoUrl: 'https://cdn.example/nova.jpg',
                artistLinkable: true,
                cover,
                playCount: 2,
                ticker: null,
                coinIcon: null,
                coin: null,
              },
            ],
            live: [
              {
                id: 'song-public',
                title: 'Other Track',
                artistName: 'Nova',
                artistId: 'public-artist',
                artistPhotoUrl: null,
                artistLinkable: true,
                cover,
                playCount: 2,
                ticker: null,
                coinIcon: null,
                coin: null,
              },
            ],
          })
        )
      )
    );

    assert.match(home, /Public Track/);
    assert.match(home, /Other Track/);
    assert.match(home, /Hidden Band/);
    assert.equal(home.includes('href="/artists/private-artist"'), false);
    assert.match(home, /href="\/artists\/public-artist"/);
    assert.match(home, />HB</);
  });
});

describe('deleted comment line', () => {
  it('is the muted Figtree sentence with no avatar, name, or time', () => {
    const html = renderToStaticMarkup(createElement(DeletedCommentLine) as ReactElement);
    assert.equal(html.includes('Comment deleted'), true);
    assert.match(html, /font-family:var\(--font-figtree\)/);
    assert.match(html, /color:var\(--mute\)/);
    assert.equal(/avatar|timestamp|ago/i.test(html), false);
    assert.equal(html.includes('<img'), false);
  });
});
