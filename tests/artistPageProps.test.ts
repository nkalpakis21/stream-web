import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { Timestamp as ClientTimestamp } from 'firebase/firestore';
import { artistPageClientProps } from '../lib/artists/pageProps';
import { artistShareMetadata } from '../lib/artists/visibility';

const CREATED = 1_700_000_000_000;
const UPDATED = 1_700_000_100_000;
const LAUNCHED = 1_700_000_200_000;
const VERIFIED = 1_700_000_300_000;
const CONNECTED = 1_700_000_400_000;
const POSTED = 1_700_000_500_000;
const VERSIONED = 1_700_000_600_000;
const COVER = 1_700_000_700_000;

class DateOnlyStamp {
  constructor(private readonly ms: number) {}
  toDate(): Date {
    return new Date(this.ms);
  }
}

function rawArtist() {
  return {
    id: 'NDWh0tVQs5fD1Lydi7yZ',
    ownerId: 'owner-1',
    name: 'jimmy',
    nameLowercase: 'jimmy',
    avatarURL: 'https://cdn.example/jimmy.jpg',
    lore: 'Night bus anthems',
    vocalIdentity: 'husky tenor',
    isPublic: true,
    createdAt: AdminTimestamp.fromMillis(CREATED),
    updatedAt: AdminTimestamp.fromMillis(UPDATED),
    deletedAt: null,
    currentVersionId: 'ver-1',
    styleDNA: {
      genres: ['house'],
      moods: ['late'],
      tempoRange: { min: 118, max: 124 },
      influences: ['Daft Punk'],
    },
    pumpFun: {
      mint: 'mint-1',
      url: 'https://pump.fun/mint-1',
      symbol: 'JIMMY',
      launchedAt: AdminTimestamp.fromMillis(LAUNCHED),
      creatorWallet: 'wallet',
      verifiedAt: AdminTimestamp.fromMillis(VERIFIED),
    },
    x: {
      status: 'connected' as const,
      username: 'jimmy',
      userId: '1',
      connectedAt: new DateOnlyStamp(CONNECTED),
      pausedAt: null,
      lastError: null,
      lastErrorAt: null,
      profileSyncedAt: new Date(CONNECTED),
      recentPostTexts: ['hello'],
      posts: [
        {
          tweetId: 't1',
          url: 'https://x.com/jimmy/status/1',
          songId: 'song-1',
          songTitle: 'Night Bus',
          text: 'out now',
          createdAt: AdminTimestamp.fromMillis(POSTED),
        },
      ],
    },
    versions: [
      {
        id: 'ver-1',
        createdAt: ClientTimestamp.fromMillis(VERSIONED),
        name: 'jimmy',
      },
    ],
  };
}

function rawSong() {
  return {
    id: 'song-1',
    ownerId: 'owner-1',
    artistId: 'NDWh0tVQs5fD1Lydi7yZ',
    title: 'Night Bus',
    createdAt: ClientTimestamp.fromMillis(CREATED),
    updatedAt: AdminTimestamp.fromMillis(UPDATED),
    deletedAt: null,
    coverUpdatedAt: new Date(COVER),
    tokenMintCreatedAt: AdminTimestamp.fromMillis(COVER),
    duration: 180,
  };
}

function assertPlain(value: unknown, path = 'props'): void {
  if (value == null || typeof value !== 'object') return;
  const proto = Object.getPrototypeOf(value);
  const expected = Array.isArray(value) ? Array.prototype : Object.prototype;
  assert.equal(proto, expected, `${path} is a class instance`);
  const record = value as { toMillis?: unknown; toDate?: unknown };
  assert.equal(typeof record.toMillis, 'undefined', `${path} still has toMillis`);
  assert.equal(typeof record.toDate, 'undefined', `${path} still has toDate`);
  assert.equal(value instanceof Date, false, `${path} is a Date`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPlain(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assertPlain(child, `${path}.${key}`);
  }
}

describe('artist page client props', () => {
  it('passes only plain serializable values to client components', () => {
    const artist = rawArtist();
    const song = rawSong();
    assert.equal(typeof artist.createdAt.toMillis, 'function');
    assert.notEqual(Object.getPrototypeOf(artist.createdAt), Object.prototype);
    assert.equal(typeof artist.pumpFun.launchedAt.toMillis, 'function');

    const coin = {
      priceUsd: 0.01,
      change24h: 1.5,
      marketCap: 1000,
      sparkline: [1, 2],
    };
    const props = artistPageClientProps({
      artist,
      songs: [song],
      coin,
    });

    assertPlain(props);
    assert.deepEqual(structuredClone(props), props);
    assert.deepEqual(JSON.parse(JSON.stringify(props)), props);

    assert.equal(props.artist.createdAt, CREATED);
    assert.equal(props.artist.updatedAt, UPDATED);
    assert.equal(props.artist.deletedAt, null);
    assert.equal(props.artist.pumpFun?.launchedAt, LAUNCHED);
    assert.equal(props.artist.pumpFun?.verifiedAt, VERIFIED);
    assert.equal(props.artist.x?.connectedAt, CONNECTED);
    assert.equal(props.artist.x?.profileSyncedAt, CONNECTED);
    assert.equal(props.artist.x?.posts[0]?.createdAt, POSTED);
    assert.equal(props.artist.versions[0]?.createdAt, VERSIONED);
    assert.equal(props.artist.name, 'jimmy');
    assert.equal(props.songs[0]?.createdAt, CREATED);
    assert.equal(props.songs[0]?.updatedAt, UPDATED);
    assert.equal(props.songs[0]?.coverUpdatedAt, COVER);
    assert.equal(props.songs[0]?.tokenMintCreatedAt, COVER);
    assert.equal(props.songs[0]?.deletedAt, null);
    assert.equal(props.coin?.priceUsd, 0.01);
    assert.deepEqual(props.coin?.sparkline, [1, 2]);
  });

  it('keeps share metadata and the not-found payload free of timestamps', () => {
    const share = artistShareMetadata(
      rawArtist(),
      'https://streamstar.xyz/artists/NDWh0tVQs5fD1Lydi7yZ'
    );
    assert.equal(share.title, 'jimmy');
    assert.equal(share.image, 'https://cdn.example/jimmy.jpg');
    assertPlain(share);
    assert.deepEqual(JSON.parse(JSON.stringify(share)), share);

    const hidden = artistShareMetadata(
      { ...rawArtist(), isPublic: false, deletedAt: AdminTimestamp.fromMillis(CREATED) },
      'https://streamstar.xyz/artists/NDWh0tVQs5fD1Lydi7yZ'
    );
    assert.equal(hidden.description, undefined);
    assert.equal(hidden.image, null);
    assert.equal(JSON.stringify(hidden).includes('jimmy'), false);
    assertPlain(hidden);
  });
});
