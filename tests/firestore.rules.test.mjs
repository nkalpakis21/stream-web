/**
 * Firestore rules tests. Run with the emulator:
 *   pnpm test:rules
 *
 * Each case is an inventoried client-SDK operation (allowed for the right
 * principal) or an abuse case (denied).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const hostPort = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-stream-rules',
  firestore: {
    rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
    host: hostPort[0],
    port: Number(hostPort[1]),
  },
});

test.after(async () => {
  await testEnv.cleanup();
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
});

const now = new Date('2026-01-15T00:00:00.000Z');

function dbFor(uid) {
  return uid
    ? testEnv.authenticatedContext(uid).firestore()
    : testEnv.unauthenticatedContext().firestore();
}

async function seed(writer) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await writer(context.firestore());
  });
}

function artistData(overrides = {}) {
  return {
    id: 'artist1',
    ownerId: 'alice',
    name: 'Nova',
    nameLowercase: 'nova',
    avatarURL: null,
    styleDNA: { genres: ['pop'], moods: ['bright'], tempoRange: { min: 90, max: 120 }, influences: [] },
    lore: 'A public artist',
    vocalIdentity: null,
    isPublic: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    currentVersionId: 'av1',
    pumpFun: {
      mint: null,
      url: null,
      symbol: null,
      launchedAt: null,
      creatorWallet: null,
    },
    x: {
      status: 'disconnected',
      username: null,
      userId: null,
      connectedAt: null,
      pausedAt: null,
      lastError: null,
      lastErrorAt: null,
      profileSyncedAt: null,
      recentPostTexts: [],
      posts: [],
    },
    ...overrides,
  };
}

function songData(overrides = {}) {
  return {
    id: 'song1',
    ownerId: 'alice',
    artistId: 'artist1',
    artistVersionId: 'av1',
    title: 'First Light',
    isPublic: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    currentVersionId: 'ver1',
    parentSongId: null,
    collaborationType: null,
    albumCoverPath: null,
    albumCoverThumbnail: null,
    coverPosterUrl: null,
    coverVideoUrl: null,
    coverMotionStatus: null,
    coverMotionError: null,
    coverUpdatedAt: null,
    coverProvider: null,
    playCount: 0,
    ...overrides,
  };
}

function versionData(overrides = {}) {
  return {
    id: 'ver1',
    songId: 'song1',
    versionNumber: 1,
    title: 'First Light',
    createdBy: 'alice',
    createdAt: now,
    parentVersionId: null,
    audioURL: null,
    providerOutputId: null,
    isPrimary: true,
    ...overrides,
  };
}

async function seedCatalog() {
  await seed(async (db) => {
    await setDoc(doc(db, 'artists/artist1'), artistData());
    await setDoc(doc(db, 'artistVersions/av1'), {
      id: 'av1',
      artistId: 'artist1',
      versionNumber: 1,
      name: 'Nova',
      avatarURL: null,
      styleDNA: { genres: ['pop'], moods: ['bright'], tempoRange: { min: 90, max: 120 }, influences: [] },
      lore: 'A public artist',
      vocalIdentity: null,
      createdBy: 'alice',
      createdAt: now,
      parentVersionId: null,
    });
    await setDoc(doc(db, 'artists/privateArtist'), artistData({
      id: 'privateArtist',
      name: 'Nova',
      nameLowercase: 'nova',
      isPublic: false,
    }));
    await setDoc(doc(db, 'songs/song1'), songData());
    await setDoc(doc(db, 'songs/privateSong'), songData({
      id: 'privateSong',
      isPublic: false,
      title: 'Unreleased',
    }));
    await setDoc(doc(db, 'songVersions/ver1'), versionData());
    await setDoc(doc(db, 'songVersions/privateVer'), versionData({
      id: 'privateVer',
      songId: 'privateSong',
    }));
    await setDoc(doc(db, 'generations/gen1'), {
      id: 'gen1',
      songId: 'song1',
      artistVersionId: 'av1',
      songVersionId: null,
      prompt: { structured: {}, freeText: 'a chorus' },
      parameters: {},
      provider: 'musicgpt',
      status: 'pending',
      providerTaskId: 'task-1',
      providerConversionIds: null,
      providerProcessedConversions: [],
      output: { audioURL: null, stems: null, metadata: {} },
      error: null,
      createdAt: now,
      completedAt: null,
      contentHash: null,
    });
    await setDoc(doc(db, 'users/alice'), {
      displayName: 'Alice',
      photoURL: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await setDoc(doc(db, 'users/alice/private/profile'), {
      email: 'alice@example.com',
      solanaWalletAddress: 'Wallet1111111111111111111111111111111111',
    });
    await setDoc(doc(db, 'playRateLimits/limit1'), { count: 1 });
    await setDoc(doc(db, 'coinMetadataUploads/alice'), { uid: 'alice' });
    await setDoc(doc(db, 'coinMetadataUploads/alice/coinUploads/upload1'), {
      expireAt: now,
    });
    await setDoc(doc(db, 'config/mobile'), {
      walletEnabled: true,
      coinsEnabled: true,
    });
    await setDoc(doc(db, 'artistXAuth/artist1'), {
      accessToken: 'secret-access',
      refreshToken: 'secret-refresh',
      ownerId: 'alice',
    });
    await setDoc(doc(db, 'xSongPosts/song1'), {
      songId: 'song1',
      status: 'posted',
    });
  });
}

test('signed-out users can read public artists and songs', async () => {
  await seedCatalog();
  const anon = dbFor(null);
  await assertSucceeds(getDoc(doc(anon, 'artists/artist1')));
  await assertSucceeds(getDoc(doc(anon, 'songs/song1')));
  await assertSucceeds(getDocs(query(collection(anon, 'artists'), where('isPublic', '==', true))));
  await assertSucceeds(getDocs(query(collection(anon, 'songs'), where('isPublic', '==', true))));
});

test('signed-out users cannot read private artists or songs', async () => {
  await seedCatalog();
  const anon = dbFor(null);
  await assertFails(getDoc(doc(anon, 'artists/privateArtist')));
  await assertFails(getDoc(doc(anon, 'songs/privateSong')));
});

test('owner can read and list their own private catalog', async () => {
  await seedCatalog();
  const alice = dbFor('alice');
  await assertSucceeds(getDoc(doc(alice, 'artists/privateArtist')));
  await assertSucceeds(getDoc(doc(alice, 'songs/privateSong')));
  await assertSucceeds(getDocs(query(collection(alice, 'artists'), where('ownerId', '==', 'alice'))));
  await assertSucceeds(getDocs(query(collection(alice, 'songs'), where('ownerId', '==', 'alice'))));
});

test('another user cannot list or delete someone else\'s songs', async () => {
  await seedCatalog();
  const bob = dbFor('bob');
  await assertFails(getDocs(query(collection(bob, 'songs'), where('ownerId', '==', 'alice'))));
  await assertFails(deleteDoc(doc(bob, 'songs/song1')));
  await assertFails(deleteDoc(doc(bob, 'songs/privateSong')));
  await assertFails(deleteDoc(doc(dbFor(null), 'songs/song1')));
});

test('owner can hard-delete own artist, song, and user', async () => {
  await seedCatalog();
  const alice = dbFor('alice');
  await assertSucceeds(deleteDoc(doc(alice, 'songs/song1')));
  await assertSucceeds(deleteDoc(doc(alice, 'artists/artist1')));
  await assertSucceeds(deleteDoc(doc(alice, 'users/alice')));
});

test('nobody else can delete an artist or a user', async () => {
  await seedCatalog();
  await assertFails(deleteDoc(doc(dbFor('bob'), 'artists/artist1')));
  await assertFails(deleteDoc(doc(dbFor('bob'), 'users/alice')));
  await assertFails(deleteDoc(doc(dbFor(null), 'users/alice')));
});

test('owner can create an artist, including a launched coin, and cannot seize another uid', async () => {
  const alice = dbFor('alice');
  await assertSucceeds(setDoc(doc(alice, 'artists/newArtist'), artistData({ id: 'newArtist' })));

  await assertFails(setDoc(doc(alice, 'artists/stolen'), artistData({
    id: 'stolen',
    ownerId: 'bob',
  })));

  await assertSucceeds(setDoc(doc(alice, 'artists/coined'), artistData({
    id: 'coined',
    pumpFun: {
      mint: 'MintAddress111',
      url: 'https://pump.fun/coin',
      symbol: 'NOVA',
      launchedAt: now,
      creatorWallet: 'Wallet1111111111111111111111111111111111',
    },
  })));

  await assertFails(setDoc(doc(alice, 'artists/verified'), artistData({
    id: 'verified',
    pumpFun: {
      mint: 'MintAddress111',
      url: 'https://pump.fun/coin',
      symbol: 'NOVA',
      launchedAt: now,
      creatorWallet: 'Wallet1111111111111111111111111111111111',
      verifiedAt: now,
    },
  })));

  await assertFails(setDoc(doc(alice, 'artists/meta'), artistData({
    id: 'meta',
    coinMetadataId: 'meta-id',
    coinImagePath: 'artist-looks/alice/original.jpg',
  })));

  await assertFails(setDoc(doc(alice, 'artists/linked'), artistData({
    id: 'linked',
    x: {
      status: 'connected',
      username: 'nova',
      userId: '999',
      connectedAt: now,
      pausedAt: null,
      lastError: null,
      lastErrorAt: null,
      profileSyncedAt: null,
      recentPostTexts: [],
      posts: [],
    },
  })));
});

test('owner can update artist profile fields and cannot change ownerId, coin, or X', async () => {
  await seedCatalog();
  const alice = dbFor('alice');
  const ref = doc(alice, 'artists/artist1');
  await assertFails(updateDoc(ref, {
    name: 'Nova Two',
    nameLowercase: 'nova two',
    updatedAt: now,
  }));
  await assertSucceeds(updateDoc(ref, {
    name: 'Nova',
    nameLowercase: 'nova',
    lore: 'Updated bio',
    updatedAt: now,
  }));
  await assertFails(updateDoc(ref, { ownerId: 'bob' }));
  await assertFails(updateDoc(ref, {
    pumpFun: {
      mint: 'MintAddress111',
      url: 'https://pump.fun/coin',
      symbol: 'NOVA',
      launchedAt: now,
      creatorWallet: 'Wallet1111111111111111111111111111111111',
    },
  }));
  await assertFails(updateDoc(ref, { 'pumpFun.verifiedAt': now }));
  await assertFails(updateDoc(ref, {
    x: {
      status: 'connected',
      username: 'nova',
      userId: '999',
      connectedAt: now,
      pausedAt: null,
      lastError: null,
      lastErrorAt: null,
      profileSyncedAt: null,
      recentPostTexts: [],
      posts: [],
    },
  }));
  await assertFails(updateDoc(doc(dbFor('bob'), 'artists/artist1'), { lore: 'hijack' }));
  await assertFails(updateDoc(ref, {
    x: {
      status: 'disconnected',
      username: null,
      userId: null,
      connectedAt: null,
      pausedAt: null,
      lastError: null,
      lastErrorAt: null,
      profileSyncedAt: null,
      recentPostTexts: [],
      posts: [],
      extra: true,
    },
  }));
  await assertFails(updateDoc(ref, { coinMetadataId: 'meta-id' }));
  await assertFails(updateDoc(ref, { coinImagePath: 'artist-looks/alice/original.jpg' }));
});

test('an artist created with x null can still be updated', async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'artists/nullX'), artistData({
      id: 'nullX',
      name: 'Null X',
      nameLowercase: 'null x',
      x: null,
    }));
  });
  await assertSucceeds(updateDoc(doc(dbFor('alice'), 'artists/nullX'), {
    lore: 'Still editable',
    updatedAt: now,
  }));
});

test('name search returns only public artists and an unbounded list is denied', async () => {
  await seedCatalog();
  const anon = dbFor(null);
  await assertFails(getDocs(query(
    collection(anon, 'artists'),
    where('nameLowercase', '==', 'nova'),
  )));
  await assertFails(getDocs(query(
    collection(anon, 'artists'),
    where('nameLowercase', '>=', 'nova'),
    where('nameLowercase', '<=', 'nova\uf8ff'),
  )));
  const found = await assertSucceeds(getDocs(query(
    collection(anon, 'artists'),
    where('isPublic', '==', true),
    where('deletedAt', '==', null),
    where('nameLowercase', '>=', 'nova'),
    where('nameLowercase', '<=', 'nova\uf8ff'),
    orderBy('nameLowercase', 'asc'),
  )));
  const ids = found.docs.map(snapshot => snapshot.id);
  assert.deepEqual(ids, ['artist1']);
  assert.equal(ids.includes('privateArtist'), false);
  await assertFails(getDocs(collection(anon, 'artists')));
  await assertFails(getDocs(query(collection(anon, 'artists'), where('deletedAt', '==', null))));
});

test('owner can create a song for their artist only, with no cover or token fields set', async () => {
  await seedCatalog();
  const alice = dbFor('alice');
  await assertSucceeds(setDoc(doc(alice, 'songs/song2'), songData({
    id: 'song2',
    title: 'Second',
    currentVersionId: 'song2ver',
  })));
  await assertFails(setDoc(doc(alice, 'songs/songTakenVersion'), songData({
    id: 'songTakenVersion',
    currentVersionId: 'ver1',
  })));
  await assertFails(setDoc(doc(alice, 'songs/songWrongArtistVersion'), songData({
    id: 'songWrongArtistVersion',
    currentVersionId: 'songWrongVer',
    artistVersionId: 'missingAv',
  })));
  await assertFails(setDoc(doc(dbFor('bob'), 'songs/song3'), songData({
    id: 'song3',
    ownerId: 'bob',
  })));
  await assertFails(setDoc(doc(alice, 'songs/song4'), songData({
    id: 'song4',
    coverPosterUrl: 'https://cdn.example/cover.jpg',
  })));
  await assertFails(setDoc(doc(alice, 'songs/song5'), songData({
    id: 'song5',
    tokenMintAddress: 'MintAddress111',
  })));
});

test('owner can retitle or soft-delete a song and cannot change ownerId or covers', async () => {
  await seedCatalog();
  const alice = dbFor('alice');
  const ref = doc(alice, 'songs/song1');
  await assertSucceeds(updateDoc(ref, { title: 'Renamed', updatedAt: now }));
  await assertSucceeds(setDoc(doc(alice, 'songVersions/verMoved'), versionData({
    id: 'verMoved',
    songId: 'song1',
    versionNumber: 9,
  })));
  await assertSucceeds(updateDoc(ref, { currentVersionId: 'verMoved', updatedAt: now }));
  await assertFails(updateDoc(ref, { currentVersionId: 'privateVer', updatedAt: now }));
  await assertFails(updateDoc(ref, { currentVersionId: 'missingVer', updatedAt: now }));
  await assertSucceeds(setDoc(doc(alice, 'artistVersions/avMoved'), {
    id: 'avMoved',
    artistId: 'artist1',
    versionNumber: 2,
    name: 'Nova',
    avatarURL: null,
    styleDNA: { genres: ['pop'], moods: ['bright'], tempoRange: { min: 90, max: 120 }, influences: [] },
    lore: 'A public artist',
    vocalIdentity: null,
    createdBy: 'alice',
    createdAt: now,
    parentVersionId: 'av1',
  }));
  await assertSucceeds(updateDoc(ref, { artistVersionId: 'avMoved', updatedAt: now }));
  await assertFails(updateDoc(ref, { artistVersionId: 'missingAv', updatedAt: now }));
  await assertSucceeds(updateDoc(ref, { deletedAt: now, updatedAt: now }));
  await assertFails(updateDoc(ref, { ownerId: 'bob' }));
  await assertFails(updateDoc(ref, { coverPosterUrl: 'https://cdn.example/cover.jpg' }));
  await assertFails(updateDoc(ref, { albumCoverPath: 'https://cdn.example/legacy.jpg' }));
  await assertFails(updateDoc(ref, { tokenMintAddress: 'MintAddress111', updatedAt: now }));
  await assertFails(updateDoc(doc(dbFor(null), 'songs/song1'), { title: 'Pwned' }));
  await assertFails(updateDoc(doc(dbFor('bob'), 'songs/song1'), { isPublic: false }));
});

test('clients cannot write playCount, playsBySource, or playsBackground', async () => {
  await seedCatalog();
  const anon = dbFor(null);
  const alice = dbFor('alice');
  await assertFails(updateDoc(doc(anon, 'songs/song1'), { playCount: increment(1) }));
  await assertFails(updateDoc(doc(anon, 'songs/song1'), { playCount: 100 }));
  await assertFails(updateDoc(doc(alice, 'songs/song1'), { playCount: increment(1) }));
  await assertFails(updateDoc(doc(alice, 'songs/song1'), { playCount: 4 }));
  await assertFails(updateDoc(doc(alice, 'songs/song1'), { playsBySource: { web: 1 } }));
  await assertFails(updateDoc(doc(alice, 'songs/song1'), { playsBackground: 1 }));
  await assertSucceeds(updateDoc(doc(alice, 'songs/song1'), { title: 'Still Mine', updatedAt: now }));
});

test('a legacy song missing server fields can still be retitled', async () => {
  const data = songData({ id: 'legacy' });
  for (const field of [
    'playCount',
    'playsBySource',
    'playsBackground',
    'albumCoverPath',
    'albumCoverThumbnail',
    'coverPosterUrl',
    'coverVideoUrl',
    'coverMotionStatus',
    'coverMotionError',
    'coverUpdatedAt',
    'coverProvider',
    'duration',
    'tokenMintAddress',
    'tokenMintCreatedAt',
  ]) {
    delete data[field];
  }
  await seed(async (db) => {
    await setDoc(doc(db, 'songs/legacy'), data);
  });
  await assertSucceeds(updateDoc(doc(dbFor('alice'), 'songs/legacy'), {
    title: 'Still here',
    updatedAt: now,
  }));
});

test('a missing playCount cannot be bumped by a client', async () => {
  await seed(async (db) => {
    const data = songData();
    delete data.playCount;
    await setDoc(doc(db, 'songs/song1'), data);
  });
  await assertFails(updateDoc(doc(dbFor(null), 'songs/song1'), { playCount: increment(1) }));
  await assertFails(updateDoc(doc(dbFor('alice'), 'songs/song1'), { playCount: 1 }));
});

test('public song versions and generations are readable; private ones are owner-only', async () => {
  await seedCatalog();
  const anon = dbFor(null);
  const alice = dbFor('alice');
  await assertSucceeds(getDocs(query(collection(anon, 'songVersions'), where('songId', '==', 'song1'))));
  await assertSucceeds(getDocs(query(collection(anon, 'generations'), where('songId', '==', 'song1'))));
  await assertFails(getDocs(query(collection(anon, 'songVersions'), where('songId', '==', 'privateSong'))));
  await assertSucceeds(getDocs(query(collection(alice, 'songVersions'), where('songId', '==', 'privateSong'))));
  await assertFails(getDocs(query(collection(anon, 'generations'), where('providerTaskId', '==', 'task-1'))));
  await assertFails(getDocs(query(collection(anon, 'generations'), where('status', '==', 'pending'))));
});

test('owner can create a silent song version and a pending generation, not audio or a completed job', async () => {
  await seedCatalog();
  const alice = dbFor('alice');
  await assertSucceeds(setDoc(doc(alice, 'songVersions/ver2'), versionData({
    id: 'ver2',
    versionNumber: 2,
    isPrimary: false,
  })));
  await assertFails(setDoc(doc(alice, 'songVersions/ver3'), versionData({
    id: 'ver3',
    audioURL: 'https://cdn.example/audio.mp3',
    providerOutputId: 'conv-1',
  })));
  await assertFails(setDoc(doc(dbFor(null), 'songVersions/ver4'), versionData({
    id: 'ver4',
    audioURL: 'https://cdn.example/audio.mp3',
    providerOutputId: 'conv-2',
    createdBy: 'alice',
  })));

  await assertSucceeds(setDoc(doc(alice, 'generations/gen2'), {
    id: 'gen2',
    songId: 'song1',
    artistVersionId: 'av1',
    songVersionId: null,
    prompt: { structured: {}, freeText: 'verse' },
    parameters: {},
    provider: 'musicgpt',
    status: 'pending',
    providerTaskId: 'task-2',
    providerConversionIds: ['c1'],
    providerProcessedConversions: [],
    output: { audioURL: null, stems: null, metadata: {} },
    error: null,
    createdAt: now,
    completedAt: null,
    contentHash: null,
  }));
  await assertFails(setDoc(doc(alice, 'generations/gen3'), {
    id: 'gen3',
    songId: 'song1',
    status: 'completed',
    completedAt: now,
    contentHash: null,
    output: { audioURL: 'https://cdn.example/audio.mp3', stems: null, metadata: {} },
  }));
  await assertFails(updateDoc(doc(alice, 'generations/gen1'), { error: 'retry later' }));
  await assertFails(deleteDoc(doc(alice, 'generations/gen1')));
  await assertFails(updateDoc(doc(alice, 'generations/gen1'), {
    output: { audioURL: 'https://cdn.example/audio.mp3', stems: null, metadata: {} },
  }));
  await assertFails(setDoc(doc(alice, 'generations/foreignOwner'), {
    id: 'foreignOwner',
    songId: 'song1',
    status: 'pending',
    completedAt: null,
    contentHash: null,
    ownerId: 'bob',
    output: { audioURL: null, stems: null, metadata: {} },
  }));
});

test('owner can change isPrimary and cannot write audioURL', async () => {
  await seedCatalog();
  const alice = dbFor('alice');
  await assertSucceeds(updateDoc(doc(alice, 'songVersions/ver1'), { isPrimary: false }));
  await assertFails(updateDoc(doc(alice, 'songVersions/ver1'), {
    audioURL: 'https://cdn.example/audio.mp3',
  }));
  await assertFails(updateDoc(doc(dbFor('bob'), 'songVersions/ver1'), { isPrimary: false }));
  await assertFails(updateDoc(doc(alice, 'songVersions/ver1'), { createdBy: 'bob' }));
  await assertFails(updateDoc(doc(alice, 'songVersions/ver1'), {
    audioURL: 'https://cdn.example/other.mp3',
  }));
});

test('config/mobile is world-readable and not client-writable', async () => {
  await seedCatalog();
  await assertSucceeds(getDoc(doc(dbFor(null), 'config/mobile')));
  await assertSucceeds(getDoc(doc(dbFor('alice'), 'config/mobile')));
  await assertFails(setDoc(doc(dbFor(null), 'config/mobile'), { walletEnabled: false }));
  await assertFails(updateDoc(doc(dbFor('alice'), 'config/mobile'), { coinsEnabled: false }));
  await assertFails(deleteDoc(doc(dbFor('alice'), 'config/mobile')));
  await assertFails(getDoc(doc(dbFor('alice'), 'config/other')));
});

test('X tokens and song-post claims are unreadable and unwritable', async () => {
  await seedCatalog();
  for (const uid of [null, 'alice', 'bob']) {
    const db = dbFor(uid);
    await assertFails(getDoc(doc(db, 'artistXAuth/artist1')));
    await assertFails(getDoc(doc(db, 'xSongPosts/song1')));
    await assertFails(setDoc(doc(db, 'artistXAuth/artist1'), { accessToken: 'x' }));
    await assertFails(deleteDoc(doc(db, 'xSongPosts/song1')));
  }
});

test('user profile get and display-name search work; unbounded user list does not', async () => {
  await seedCatalog();
  const anon = dbFor(null);
  await assertSucceeds(getDoc(doc(anon, 'users/alice')));
  await assertSucceeds(getDocs(query(
    collection(anon, 'users'),
    where('displayName', '==', 'Alice'),
  )));
  await assertFails(getDocs(collection(anon, 'users')));
});

test('public user docs omit email and wallet; the private profile is owner-only', async () => {
  const bob = dbFor('bob');
  await assertFails(setDoc(doc(bob, 'users/bob'), {
    email: 'bob@example.com',
    displayName: 'Bob',
    photoURL: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }));
  await assertFails(setDoc(doc(bob, 'users/bob'), {
    displayName: 'Bob',
    solanaWalletAddress: 'Wallet1111111111111111111111111111111111',
    deletedAt: null,
  }));
  await assertSucceeds(setDoc(doc(bob, 'users/bob'), {
    displayName: 'Bob',
    photoURL: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }));
  const created = await assertSucceeds(getDoc(doc(dbFor(null), 'users/bob')));
  assert.equal(created.exists(), true);
  assert.equal(Object.hasOwn(created.data(), 'email'), false);
  assert.equal(Object.hasOwn(created.data(), 'solanaWalletAddress'), false);
  await assertSucceeds(updateDoc(doc(bob, 'users/bob'), {
    displayName: 'Bobby',
    updatedAt: now,
  }));
  await assertFails(updateDoc(doc(bob, 'users/bob'), { email: 'eve@example.com' }));
  await assertFails(updateDoc(doc(bob, 'users/bob'), {
    solanaWalletAddress: 'Wallet1111111111111111111111111111111111',
  }));
  await assertFails(setDoc(doc(bob, 'users/alice'), {
    displayName: 'Not Alice',
    deletedAt: null,
  }));

  await assertFails(setDoc(doc(bob, 'users/bob/private/profile'), {
    email: 'bob@example.com',
    solanaWalletAddress: 'Wallet1111111111111111111111111111111111',
  }));
  await seed(async (db) => {
    await setDoc(doc(db, 'users/alice/private/profile'), {
      email: 'alice@example.com',
      solanaWalletAddress: 'Wallet1111111111111111111111111111111111',
    });
  });
  await assertFails(updateDoc(doc(dbFor('alice'), 'users/alice/private/profile'), {
    email: 'alice-changed@example.com',
  }));
  const own = await assertSucceeds(getDoc(doc(dbFor('alice'), 'users/alice/private/profile')));
  assert.equal(own.data().email, 'alice@example.com');
  await assertFails(getDoc(doc(dbFor(null), 'users/bob/private/profile')));
  await assertFails(getDoc(doc(dbFor('alice'), 'users/bob/private/profile')));
  await assertFails(setDoc(doc(dbFor('alice'), 'users/bob/private/profile'), {
    email: 'alice@example.com',
  }));
  await assertFails(getDocs(collection(dbFor(null), 'users/bob/private')));
});

test('follows are public to read and only the follower can write', async () => {
  await seedCatalog();
  const bob = dbFor('bob');
  await assertSucceeds(setDoc(doc(bob, 'follows/f1'), {
    id: 'f1',
    followerId: 'bob',
    artistId: 'artist1',
    createdAt: now,
  }));
  await assertSucceeds(getDocs(query(
    collection(dbFor(null), 'follows'),
    where('artistId', '==', 'artist1'),
  )));
  await assertFails(setDoc(doc(bob, 'follows/f2'), {
    id: 'f2',
    followerId: 'alice',
    artistId: 'artist1',
    createdAt: now,
  }));
  await assertFails(deleteDoc(doc(dbFor('alice'), 'follows/f1')));
  await assertSucceeds(deleteDoc(doc(bob, 'follows/f1')));
});

test('comments are publicly readable and only the author can write', async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'comments/c1'), {
      id: 'c1',
      targetType: 'song',
      targetId: 'song1',
      authorId: 'alice',
      content: 'hello',
      parentCommentId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  });
  const anon = dbFor(null);
  await assertSucceeds(getDocs(query(
    collection(anon, 'comments'),
    where('deletedAt', '==', null),
  )));
  await assertFails(getDocs(collection(anon, 'comments')));

  const alice = dbFor('alice');
  await assertSucceeds(setDoc(doc(alice, 'comments/c2'), {
    id: 'c2',
    targetType: 'artist',
    targetId: 'artist1',
    authorId: 'alice',
    content: 'nice',
    parentCommentId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }));
  await assertFails(setDoc(doc(dbFor('bob'), 'comments/c3'), {
    id: 'c3',
    targetType: 'song',
    targetId: 'song1',
    authorId: 'alice',
    content: 'forged',
    parentCommentId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }));
  await assertSucceeds(updateDoc(doc(alice, 'comments/c1'), { content: 'edited', updatedAt: now }));
  await assertFails(updateDoc(doc(dbFor('bob'), 'comments/c1'), { content: 'nope' }));
  await assertSucceeds(updateDoc(doc(alice, 'comments/c1'), { deletedAt: now }));
});

test('conversations and messages stay inside the participant set', async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'conversations/c1'), {
      id: 'c1',
      type: 'direct',
      participants: ['alice', 'bob'],
      createdBy: 'alice',
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      lastMessagePreview: null,
    });
    await setDoc(doc(db, 'messages/m1'), {
      id: 'm1',
      conversationId: 'c1',
      senderId: 'alice',
      content: 'hey',
      createdAt: now,
      readBy: ['alice'],
      deletedAt: null,
    });
  });

  const alice = dbFor('alice');
  const bob = dbFor('bob');
  const carol = dbFor('carol');
  await assertSucceeds(getDocs(query(
    collection(alice, 'conversations'),
    where('participants', 'array-contains', 'alice'),
  )));
  await assertFails(getDocs(query(
    collection(carol, 'conversations'),
    where('participants', 'array-contains', 'alice'),
  )));
  await assertFails(getDocs(query(
    collection(alice, 'conversations'),
    where('type', '==', 'direct'),
  )));
  await assertFails(getDoc(doc(carol, 'conversations/c1')));
  await assertSucceeds(getDocs(query(
    collection(bob, 'messages'),
    where('conversationId', '==', 'c1'),
  )));
  await assertFails(getDocs(query(
    collection(carol, 'messages'),
    where('conversationId', '==', 'c1'),
  )));

  await assertSucceeds(setDoc(doc(alice, 'conversations/c2'), {
    id: 'c2',
    type: 'direct',
    participants: ['alice', 'carol'],
    createdBy: 'alice',
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    lastMessagePreview: null,
  }));
  await assertFails(setDoc(doc(carol, 'conversations/c3'), {
    id: 'c3',
    type: 'direct',
    participants: ['alice', 'bob'],
    createdBy: 'carol',
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    lastMessagePreview: null,
  }));

  await assertSucceeds(updateDoc(doc(bob, 'conversations/c1'), {
    lastMessageAt: now,
    lastMessagePreview: 'yo',
    updatedAt: now,
  }));
  await assertSucceeds(updateDoc(doc(alice, 'conversations/c1'), {
    title: 'Session',
    updatedAt: now,
  }));
  await assertFails(updateDoc(doc(bob, 'conversations/c1'), {
    title: 'Stolen',
    updatedAt: now,
  }));

  await assertSucceeds(setDoc(doc(bob, 'messages/m2'), {
    id: 'm2',
    conversationId: 'c1',
    senderId: 'bob',
    content: 'yo',
    createdAt: now,
    readBy: ['bob'],
    deletedAt: null,
  }));
  await assertFails(setDoc(doc(carol, 'messages/m3'), {
    id: 'm3',
    conversationId: 'c1',
    senderId: 'carol',
    content: 'intruder',
    createdAt: now,
    readBy: ['carol'],
    deletedAt: null,
  }));
  await assertSucceeds(updateDoc(doc(bob, 'messages/m1'), { readBy: ['alice', 'bob'] }));
  await assertSucceeds(updateDoc(doc(alice, 'messages/m1'), { deletedAt: now }));
  await assertFails(updateDoc(doc(bob, 'messages/m1'), {
    deletedAt: new Date('2026-02-01T00:00:00.000Z'),
  }));
  await assertFails(deleteDoc(doc(alice, 'messages/m1')));
});

test('notification reads and read-receipts are recipient-scoped; creates are denied', async () => {
  await seedCatalog();
  await seed(async (db) => {
    await setDoc(doc(db, 'notifications/n1'), {
      id: 'n1',
      userId: 'alice',
      type: 'song_ready',
      songId: 'song1',
      generationId: 'gen1',
      read: false,
      createdAt: now,
      deletedAt: null,
    });
    await setDoc(doc(db, 'notifications/n2'), {
      id: 'n2',
      userId: 'bob',
      type: 'song_ready',
      songId: 'song1',
      generationId: 'gen1',
      read: false,
      createdAt: now,
      deletedAt: null,
    });
  });

  const alice = dbFor('alice');
  await assertSucceeds(getDocs(query(
    collection(alice, 'notifications'),
    where('userId', '==', 'alice'),
  )));
  await assertFails(getDocs(query(
    collection(dbFor('bob'), 'notifications'),
    where('userId', '==', 'alice'),
  )));
  await assertSucceeds(getDocs(query(
    collection(alice, 'notifications'),
    where('songId', '==', 'song1'),
  )));
  await assertFails(getDocs(query(
    collection(dbFor('carol'), 'notifications'),
    where('songId', '==', 'song1'),
  )));
  await assertSucceeds(updateDoc(doc(alice, 'notifications/n1'), { read: true }));
  await assertSucceeds(updateDoc(doc(alice, 'notifications/n2'), { deletedAt: now }));
  await assertFails(setDoc(doc(alice, 'notifications/n3'), {
    id: 'n3',
    userId: 'alice',
    type: 'song_ready',
    songId: 'song1',
    generationId: 'gen1',
    read: false,
    createdAt: now,
    deletedAt: null,
  }));
  await assertFails(updateDoc(doc(dbFor('bob'), 'notifications/n1'), { read: true }));
});

test('artist versions follow the parent artist and only the owner can create them', async () => {
  await seedCatalog();
  await seed(async (db) => {
    await setDoc(doc(db, 'artistVersions/av1'), {
      id: 'av1',
      artistId: 'artist1',
      versionNumber: 1,
      name: 'Nova',
      avatarURL: null,
      styleDNA: { genres: [], moods: [], tempoRange: { min: 1, max: 2 }, influences: [] },
      lore: 'A public artist',
      vocalIdentity: null,
      createdBy: 'alice',
      createdAt: now,
      parentVersionId: null,
    });
  });
  await assertSucceeds(getDocs(query(
    collection(dbFor(null), 'artistVersions'),
    where('artistId', '==', 'artist1'),
  )));
  const alice = dbFor('alice');
  await assertSucceeds(setDoc(doc(alice, 'artistVersions/av2'), {
    id: 'av2',
    artistId: 'artist1',
    versionNumber: 2,
    name: 'Nova',
    avatarURL: null,
    styleDNA: { genres: [], moods: [], tempoRange: { min: 1, max: 2 }, influences: [] },
    lore: 'Updated',
    vocalIdentity: null,
    createdBy: 'alice',
    createdAt: now,
    parentVersionId: 'av1',
  }));
  await assertFails(setDoc(doc(dbFor('bob'), 'artistVersions/av3'), {
    id: 'av3',
    artistId: 'artist1',
    versionNumber: 3,
    name: 'Nova',
    createdBy: 'bob',
    createdAt: now,
    parentVersionId: 'av1',
  }));
  await assertSucceeds(updateDoc(doc(alice, 'artistVersions/av1'), { lore: 'Edited by owner' }));
  await assertFails(updateDoc(doc(alice, 'artistVersions/av1'), { createdBy: 'bob' }));
  await assertFails(updateDoc(doc(dbFor('bob'), 'artistVersions/av1'), { lore: 'hijack' }));
});

test('collaboration records are readable by source song and created only as yourself', async () => {
  const alice = dbFor('alice');
  await assertSucceeds(setDoc(doc(alice, 'collaborations/col1'), {
    id: 'col1',
    type: 'fork',
    sourceSongId: 'song1',
    targetSongId: 'song2',
    collaboratorId: 'alice',
    notes: null,
    createdAt: now,
  }));
  await assertSucceeds(getDocs(query(
    collection(dbFor(null), 'collaborations'),
    where('sourceSongId', '==', 'song1'),
  )));
  await assertFails(getDocs(collection(dbFor(null), 'collaborations')));
  await assertFails(setDoc(doc(dbFor('bob'), 'collaborations/col2'), {
    id: 'col2',
    type: 'remix',
    sourceSongId: 'song1',
    targetSongId: 'song9',
    collaboratorId: 'alice',
    notes: null,
    createdAt: now,
  }));
});

test('launched-coin lookup by mint requires isPublic and hides private artists', async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'artists/artist1'), artistData({
      pumpFun: {
        mint: 'MintAddress111',
        url: 'https://pump.fun/coin',
        symbol: 'NOVA',
        launchedAt: now,
        creatorWallet: 'Wallet1111111111111111111111111111111111',
      },
    }));
    await setDoc(doc(db, 'artists/privateArtist'), artistData({
      id: 'privateArtist',
      isPublic: false,
      pumpFun: {
        mint: 'MintPrivate111',
        url: 'https://pump.fun/private',
        symbol: 'HIDE',
        launchedAt: now,
        creatorWallet: 'Wallet1111111111111111111111111111111111',
      },
    }));
  });
  await assertFails(getDocs(query(
    collection(dbFor(null), 'artists'),
    where('pumpFun.mint', 'in', ['MintAddress111', 'MintPrivate111']),
  )));
  const found = await assertSucceeds(getDocs(query(
    collection(dbFor(null), 'artists'),
    where('isPublic', '==', true),
    where('pumpFun.mint', 'in', ['MintAddress111', 'MintPrivate111']),
  )));
  assert.deepEqual(found.docs.map(snapshot => snapshot.id), ['artist1']);
});

test('signed-out Heat and Discover queries read public songs and artists only', async () => {
  await seedCatalog();
  const anon = dbFor(null);
  const heat = await assertSucceeds(getDocs(query(
    collection(anon, 'songs'),
    where('isPublic', '==', true),
    where('deletedAt', '==', null),
    orderBy('playCount', 'desc'),
  )));
  assert.deepEqual(heat.docs.map(snapshot => snapshot.id), ['song1']);

  const discover = await assertSucceeds(getDocs(query(
    collection(anon, 'songs'),
    where('isPublic', '==', true),
    orderBy('createdAt', 'desc'),
  )));
  assert.deepEqual(discover.docs.map(snapshot => snapshot.id), ['song1']);

  const artists = await assertSucceeds(getDocs(query(
    collection(anon, 'artists'),
    where('isPublic', '==', true),
    orderBy('createdAt', 'desc'),
  )));
  assert.deepEqual(artists.docs.map(snapshot => snapshot.id), ['artist1']);

  const artistSongs = await assertSucceeds(getDocs(query(
    collection(anon, 'songs'),
    where('artistId', '==', 'artist1'),
    where('isPublic', '==', true),
    orderBy('createdAt', 'desc'),
  )));
  assert.deepEqual(artistSongs.docs.map(snapshot => snapshot.id), ['song1']);
});

test('a private song is owner-only for get', async () => {
  await seedCatalog();
  await assertFails(getDoc(doc(dbFor(null), 'songs/privateSong')));
  await assertFails(getDoc(doc(dbFor('bob'), 'songs/privateSong')));
  await assertSucceeds(getDoc(doc(dbFor('alice'), 'songs/privateSong')));
  await assertFails(getDoc(doc(dbFor('bob'), 'artists/privateArtist')));
  await assertSucceeds(getDoc(doc(dbFor('alice'), 'artists/privateArtist')));
});

test('every client operation on playRateLimits and coinMetadataUploads is denied', async () => {
  await seedCatalog();
  for (const uid of [null, 'alice', 'bob']) {
    const db = dbFor(uid);
    await assertFails(getDoc(doc(db, 'playRateLimits/limit1')));
    await assertFails(getDocs(collection(db, 'playRateLimits')));
    await assertFails(setDoc(doc(db, 'playRateLimits/limit2'), { count: 1 }));
    await assertFails(updateDoc(doc(db, 'playRateLimits/limit1'), { count: 2 }));
    await assertFails(deleteDoc(doc(db, 'playRateLimits/limit1')));
    await assertFails(getDoc(doc(db, 'playRateLimits/limit1/nested/secret')));
    await assertFails(setDoc(doc(db, 'playRateLimits/limit1/nested/secret'), { count: 1 }));

    await assertFails(getDoc(doc(db, 'coinMetadataUploads/alice')));
    await assertFails(getDocs(collection(db, 'coinMetadataUploads')));
    await assertFails(setDoc(doc(db, 'coinMetadataUploads/bob'), { uid: 'bob' }));
    await assertFails(updateDoc(doc(db, 'coinMetadataUploads/alice'), { uid: 'bob' }));
    await assertFails(deleteDoc(doc(db, 'coinMetadataUploads/alice')));
    await assertFails(getDoc(doc(db, 'coinMetadataUploads/alice/coinUploads/upload1')));
    await assertFails(getDocs(collection(db, 'coinMetadataUploads/alice/coinUploads')));
    await assertFails(setDoc(doc(db, 'coinMetadataUploads/alice/coinUploads/upload2'), { expireAt: now }));
    await assertFails(updateDoc(doc(db, 'coinMetadataUploads/alice/coinUploads/upload1'), { expireAt: now }));
    await assertFails(deleteDoc(doc(db, 'coinMetadataUploads/alice/coinUploads/upload1')));
  }
});

test('TF 15 create payloads pass and the abusive variants are denied', async () => {
  await seedCatalog();
  const alice = dbFor('alice');
  const anon = dbFor(null);

  await assertSucceeds(setDoc(doc(alice, 'songs/tfSong'), songData({
    id: 'tfSong',
    currentVersionId: 'tfSongVer',
    playCount: 0,
    albumCoverPath: null,
    albumCoverThumbnail: null,
    coverPosterUrl: null,
    coverVideoUrl: null,
    coverMotionStatus: null,
    coverMotionError: null,
    coverUpdatedAt: null,
    coverProvider: null,
  })));
  await assertFails(setDoc(doc(alice, 'songs/loud'), songData({
    id: 'loud',
    playCount: 5,
  })));
  await assertFails(setDoc(doc(alice, 'songs/covered'), songData({
    id: 'covered',
    coverPosterUrl: 'https://cdn.example/cover.jpg',
  })));

  await assertSucceeds(setDoc(doc(alice, 'songVersions/tfVer'), versionData({
    id: 'tfVer',
    songId: 'song1',
    versionNumber: 2,
    createdBy: 'alice',
    audioURL: null,
    providerOutputId: null,
  })));
  const versionOmitted = versionData({
    id: 'tfVerOmit',
    songId: 'song1',
    versionNumber: 3,
    createdBy: 'alice',
  });
  delete versionOmitted.audioURL;
  delete versionOmitted.providerOutputId;
  await assertSucceeds(setDoc(doc(alice, 'songVersions/tfVerOmit'), versionOmitted));
  await assertFails(setDoc(doc(alice, 'songVersions/tfVerAudio'), versionData({
    id: 'tfVerAudio',
    songId: 'song1',
    versionNumber: 4,
    audioURL: 'https://cdn.example/audio.mp3',
  })));

  await assertSucceeds(setDoc(doc(alice, 'artists/tfArtist'), artistData({
    id: 'tfArtist',
    ownerId: 'alice',
    pumpFun: {
      mint: 'MintFromPhone111',
      url: 'https://pump.fun/coin/MintFromPhone111',
      symbol: 'TF',
      launchedAt: now,
      creatorWallet: 'Wallet1111111111111111111111111111111111',
    },
    x: {
      status: 'disconnected',
      username: null,
      userId: null,
      connectedAt: null,
      pausedAt: null,
      lastError: null,
      lastErrorAt: null,
      profileSyncedAt: null,
      recentPostTexts: [],
      posts: [],
    },
  })));
  const xOmitted = artistData({
    id: 'tfArtistX',
    name: 'Nova X',
    nameLowercase: 'nova x',
    x: {
      status: 'disconnected',
      username: null,
      userId: null,
      connectedAt: null,
      pausedAt: null,
      lastError: null,
      lastErrorAt: null,
      profileSyncedAt: null,
    },
  });
  await assertSucceeds(setDoc(doc(alice, 'artists/tfArtistX'), xOmitted));
  await assertFails(setDoc(doc(alice, 'artists/tfMeta'), artistData({
    id: 'tfMeta',
    coinMetadataId: 'meta-id',
  })));
  await assertFails(updateDoc(doc(alice, 'artists/artist1'), {
    pumpFun: {
      mint: 'MintAddress111',
      url: 'https://pump.fun/coin',
      symbol: 'NOVA',
      launchedAt: now,
      creatorWallet: 'Wallet1111111111111111111111111111111111',
    },
  }));
  await assertFails(updateDoc(doc(alice, 'artists/artist1'), {
    x: {
      status: 'connected',
      username: 'nova',
      userId: '999',
      connectedAt: now,
      pausedAt: null,
      lastError: null,
      lastErrorAt: null,
      profileSyncedAt: null,
      recentPostTexts: [],
      posts: [],
    },
  }));

  await assertSucceeds(setDoc(doc(alice, 'artistVersions/tfAv'), {
    id: 'tfAv',
    artistId: 'artist1',
    versionNumber: 2,
    name: 'Nova',
    avatarURL: null,
    styleDNA: { genres: ['pop'], moods: ['bright'], tempoRange: { min: 90, max: 120 }, influences: [] },
    lore: 'A public artist',
    vocalIdentity: null,
    createdBy: 'alice',
    createdAt: now,
    parentVersionId: null,
  }));

  await assertSucceeds(setDoc(doc(alice, 'generations/tfGen'), {
    id: 'tfGen',
    songId: 'song1',
    artistVersionId: 'av1',
    songVersionId: null,
    prompt: { structured: {}, freeText: 'tf' },
    parameters: {},
    provider: 'musicgpt',
    status: 'pending',
    providerTaskId: null,
    providerConversionIds: null,
    providerProcessedConversions: [],
    output: { audioURL: null, stems: [], metadata: {} },
    error: null,
    createdAt: now,
    completedAt: null,
    contentHash: null,
  }));
  const generationOmitted = {
    id: 'tfGenOmit',
    songId: 'song1',
    artistVersionId: 'av1',
    songVersionId: null,
    prompt: { structured: {}, freeText: 'tf' },
    parameters: {},
    provider: 'musicgpt',
    status: 'pending',
    providerTaskId: null,
    providerConversionIds: null,
    providerProcessedConversions: [],
    output: { metadata: {} },
    error: null,
    createdAt: now,
  };
  await assertSucceeds(setDoc(doc(alice, 'generations/tfGenOmit'), generationOmitted));
  await assertFails(setDoc(doc(alice, 'generations/tfGenDone'), {
    ...generationOmitted,
    id: 'tfGenDone',
    completedAt: now,
    output: { audioURL: 'https://cdn.example/out.mp3', stems: ['https://cdn.example/stem.mp3'], metadata: {} },
  }));
  await assertFails(setDoc(doc(dbFor('bob'), 'generations/stolen'), {
    id: 'stolen',
    songId: 'song1',
    status: 'pending',
    completedAt: null,
    contentHash: null,
    output: { audioURL: null, stems: null, metadata: {} },
  }));

  const publicSongs = await assertSucceeds(getDocs(query(
    collection(anon, 'songs'),
    where('isPublic', '==', true),
    where('deletedAt', '==', null),
    orderBy('createdAt', 'desc'),
  )));
  assert.ok(publicSongs.docs.every(snapshot => snapshot.data().isPublic === true));

  const topSongs = await assertSucceeds(getDocs(query(
    collection(anon, 'songs'),
    where('isPublic', '==', true),
    where('deletedAt', '==', null),
    orderBy('playCount', 'desc'),
  )));
  assert.ok(topSongs.docs.some(snapshot => snapshot.id === 'song1'));

  const artistSongs = await assertSucceeds(getDocs(query(
    collection(anon, 'songs'),
    where('artistId', '==', 'artist1'),
    where('isPublic', '==', true),
    orderBy('createdAt', 'desc'),
  )));
  assert.ok(artistSongs.docs.every(snapshot => snapshot.id !== 'privateSong'));

  const publicArtists = await assertSucceeds(getDocs(query(
    collection(anon, 'artists'),
    where('isPublic', '==', true),
    orderBy('createdAt', 'desc'),
  )));
  assert.ok(publicArtists.docs.every(snapshot => snapshot.data().isPublic === true));
  assert.equal(publicArtists.docs.some(snapshot => snapshot.id === 'privateArtist'), false);

  const owned = await assertSucceeds(getDocs(query(
    collection(alice, 'artists'),
    where('ownerId', '==', 'alice'),
    orderBy('createdAt', 'desc'),
  )));
  const ownedIds = owned.docs.map(snapshot => snapshot.id);
  assert.ok(ownedIds.includes('artist1'));
  assert.ok(ownedIds.includes('privateArtist'));
  await assertFails(getDocs(query(
    collection(anon, 'artists'),
    where('ownerId', '==', 'alice'),
    orderBy('createdAt', 'desc'),
  )));

  const versions = await assertSucceeds(getDocs(query(
    collection(anon, 'songVersions'),
    where('songId', '==', 'song1'),
    orderBy('versionNumber', 'asc'),
  )));
  assert.deepEqual(versions.docs.map(snapshot => snapshot.id), ['ver1', 'tfVer', 'tfVerOmit']);

  const generations = await assertSucceeds(getDocs(query(
    collection(anon, 'generations'),
    where('songId', '==', 'song1'),
    orderBy('createdAt', 'desc'),
  )));
  assert.ok(generations.docs.some(snapshot => snapshot.id === 'gen1'));
  await assertFails(getDocs(query(
    collection(anon, 'generations'),
    where('songId', '==', 'privateSong'),
    orderBy('createdAt', 'desc'),
  )));

  await assertSucceeds(getDoc(doc(anon, 'config/mobile')));
});

test('web client create payloads pass, and a missing or foreign owner is denied', async () => {
  await seedCatalog();
  await seed(async (db) => {
    await setDoc(doc(db, 'songs/bobSong'), songData({
      id: 'bobSong',
      ownerId: 'bob',
    }));
  });
  const alice = dbFor('alice');
  const styleDNA = {
    genres: ['jazz'],
    moods: ['calm'],
    tempoRange: { min: 80, max: 120 },
    influences: [],
  };

  // createArtist: empty coin (launch opted out) plus emptyXConnection().
  await assertSucceeds(setDoc(doc(alice, 'artists/webArtist'), {
    id: 'webArtist',
    ownerId: 'alice',
    name: 'Nova Web',
    nameLowercase: 'nova web',
    avatarURL: null,
    styleDNA,
    lore: 'A short bio',
    vocalIdentity: null,
    isPublic: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    currentVersionId: 'webAv',
    pumpFun: {
      mint: null,
      url: null,
      symbol: null,
      launchedAt: null,
      creatorWallet: null,
    },
    x: {
      status: 'disconnected',
      username: null,
      userId: null,
      connectedAt: null,
      pausedAt: null,
      lastError: null,
      lastErrorAt: null,
      profileSyncedAt: null,
      recentPostTexts: [],
      posts: [],
    },
  }));
  // createArtist when the wallet launch returns a coin. Same keys, real values.
  await assertSucceeds(setDoc(doc(alice, 'artists/webLaunched'), {
    id: 'webLaunched',
    ownerId: 'alice',
    name: 'Nova Coin',
    nameLowercase: 'nova coin',
    avatarURL: 'https://cdn.example/look.jpg',
    styleDNA,
    lore: 'Launched',
    vocalIdentity: 'warm alto',
    isPublic: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    currentVersionId: 'webAvLaunch',
    pumpFun: {
      mint: 'MintFromWeb111',
      url: 'https://pump.fun/coin/MintFromWeb111',
      symbol: 'WEB',
      launchedAt: now,
      creatorWallet: 'Wallet1111111111111111111111111111111111',
    },
    x: {
      status: 'disconnected',
      username: null,
      userId: null,
      connectedAt: null,
      pausedAt: null,
      lastError: null,
      lastErrorAt: null,
      profileSyncedAt: null,
      recentPostTexts: [],
      posts: [],
    },
  }));

  // Initial artist version from createArtist, then a later createArtistVersion.
  await assertSucceeds(setDoc(doc(alice, 'artistVersions/webAv'), {
    id: 'webAv',
    artistId: 'webArtist',
    versionNumber: 1,
    name: 'Nova Web',
    avatarURL: null,
    styleDNA,
    lore: 'A short bio',
    vocalIdentity: null,
    createdBy: 'alice',
    createdAt: now,
    parentVersionId: null,
  }));
  await assertSucceeds(setDoc(doc(alice, 'artistVersions/webAv2'), {
    id: 'webAv2',
    artistId: 'webArtist',
    versionNumber: 2,
    name: 'Nova Web',
    avatarURL: 'https://cdn.example/look.jpg',
    styleDNA,
    lore: 'Updated bio',
    vocalIdentity: 'warm alto',
    createdBy: 'alice',
    createdAt: now,
    parentVersionId: 'webAv',
  }));

  // createSong, then its first song version, then createSongVersion.
  await assertSucceeds(setDoc(doc(alice, 'songs/webSong'), {
    id: 'webSong',
    ownerId: 'alice',
    artistId: 'webArtist',
    artistVersionId: 'webAv',
    title: 'First Light',
    isPublic: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    currentVersionId: 'webVer',
    parentSongId: null,
    collaborationType: null,
    albumCoverPath: null,
    albumCoverThumbnail: null,
    coverPosterUrl: null,
    coverVideoUrl: null,
    coverMotionStatus: null,
    coverMotionError: null,
    coverUpdatedAt: null,
    coverProvider: null,
    playCount: 0,
  }));
  await assertSucceeds(setDoc(doc(alice, 'songVersions/webVer'), {
    id: 'webVer',
    songId: 'webSong',
    versionNumber: 1,
    title: 'First Light',
    createdBy: 'alice',
    createdAt: now,
    parentVersionId: null,
    audioURL: null,
    providerOutputId: null,
    isPrimary: true,
  }));
  await assertSucceeds(setDoc(doc(alice, 'songVersions/webVer2'), {
    id: 'webVer2',
    songId: 'webSong',
    versionNumber: 2,
    title: 'First Light',
    createdBy: 'alice',
    createdAt: now,
    parentVersionId: 'webVer',
    audioURL: null,
    providerOutputId: null,
    isPrimary: false,
  }));

  // createGeneration after MusicGPT returns a task, with ownerId.
  await assertSucceeds(setDoc(doc(alice, 'generations/webGen'), {
    id: 'webGen',
    ownerId: 'alice',
    songId: 'webSong',
    artistVersionId: 'webAv',
    songVersionId: null,
    prompt: { structured: {}, freeText: 'a chorus' },
    parameters: { quality: 'medium' },
    provider: 'musicgpt',
    status: 'pending',
    providerTaskId: 'task-web',
    providerConversionIds: ['conv-1'],
    providerProcessedConversions: [],
    output: {
      audioURL: null,
      stems: null,
      metadata: { conversionIds: ['conv-1'] },
    },
    error: null,
    createdAt: now,
    completedAt: null,
    contentHash: null,
  }));
  // Stub provider path from the same function.
  await assertSucceeds(setDoc(doc(alice, 'generations/webStub'), {
    id: 'webStub',
    ownerId: 'alice',
    songId: 'webSong',
    artistVersionId: 'webAv',
    songVersionId: null,
    prompt: { structured: {}, freeText: 'a chorus' },
    parameters: { quality: 'medium' },
    provider: 'stub',
    status: 'pending',
    providerTaskId: null,
    providerConversionIds: null,
    providerProcessedConversions: [],
    output: { audioURL: null, stems: null, metadata: {} },
    error: null,
    createdAt: now,
    completedAt: null,
    contentHash: null,
  }));

  const songMissing = songData({ id: 'songMissing' });
  delete songMissing.ownerId;
  await assertFails(setDoc(doc(alice, 'songs/songMissing'), songMissing));
  await assertFails(setDoc(doc(alice, 'songs/songForeign'), songData({
    id: 'songForeign',
    ownerId: 'bob',
  })));

  const artistMissing = artistData({ id: 'artistMissing', name: 'Missing', nameLowercase: 'missing' });
  delete artistMissing.ownerId;
  await assertFails(setDoc(doc(alice, 'artists/artistMissing'), artistMissing));
  await assertFails(setDoc(doc(alice, 'artists/artistForeign'), artistData({
    id: 'artistForeign',
    name: 'Foreign',
    nameLowercase: 'foreign',
    ownerId: 'bob',
  })));

  const versionMissing = versionData({ id: 'verMissing', songId: 'song1' });
  delete versionMissing.createdBy;
  await assertFails(setDoc(doc(alice, 'songVersions/verMissing'), versionMissing));
  await assertFails(setDoc(doc(alice, 'songVersions/verForeign'), versionData({
    id: 'verForeign',
    songId: 'song1',
    createdBy: 'bob',
  })));

  const artistVersionMissing = {
    id: 'avMissing',
    artistId: 'artist1',
    versionNumber: 2,
    name: 'Nova',
    avatarURL: null,
    styleDNA,
    lore: 'A public artist',
    vocalIdentity: null,
    createdAt: now,
    parentVersionId: null,
  };
  await assertFails(setDoc(doc(alice, 'artistVersions/avMissing'), artistVersionMissing));
  await assertFails(setDoc(doc(alice, 'artistVersions/avForeign'), {
    ...artistVersionMissing,
    id: 'avForeign',
    createdBy: 'bob',
  }));

  // TF 15 omits ownerId and is allowed only because Alice owns the song.
  await assertSucceeds(setDoc(doc(alice, 'generations/tfShape'), {
    id: 'tfShape',
    songId: 'song1',
    artistVersionId: 'av1',
    songVersionId: null,
    prompt: { structured: {}, freeText: 'tf' },
    parameters: {},
    provider: 'musicgpt',
    status: 'pending',
    providerTaskId: null,
    providerConversionIds: null,
    providerProcessedConversions: [],
    output: { audioURL: null, stems: null, metadata: {} },
    error: null,
    createdAt: now,
    completedAt: null,
    contentHash: null,
  }));
  await assertFails(setDoc(doc(dbFor('bob'), 'generations/tfOther'), {
    id: 'tfOther',
    songId: 'song1',
    status: 'pending',
    completedAt: null,
    contentHash: null,
    output: { audioURL: null, stems: null, metadata: {} },
  }));
  await assertFails(setDoc(doc(alice, 'generations/genForeign'), {
    id: 'genForeign',
    ownerId: 'bob',
    songId: 'song1',
    status: 'pending',
    completedAt: null,
    contentHash: null,
    output: { audioURL: null, stems: null, metadata: {} },
  }));
  await assertFails(setDoc(doc(alice, 'generations/genOtherSong'), {
    id: 'genOtherSong',
    ownerId: 'alice',
    songId: 'bobSong',
    status: 'pending',
    completedAt: null,
    contentHash: null,
    output: { audioURL: null, stems: null, metadata: {} },
  }));
});

test('catch-all denies unknown collections', async () => {
  await assertFails(getDoc(doc(dbFor(null), 'secrets/one')));
  await assertFails(setDoc(doc(dbFor('alice'), 'secrets/one'), { leak: true }));
});
