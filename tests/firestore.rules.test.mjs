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
    await setDoc(doc(db, 'artists/privateArtist'), artistData({
      id: 'privateArtist',
      name: 'Hidden',
      nameLowercase: 'hidden',
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
      email: 'alice@example.com',
      displayName: 'Alice',
      photoURL: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      solanaWalletAddress: null,
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

test('owner can create an artist and cannot seize another uid or a launched coin', async () => {
  const alice = dbFor('alice');
  await assertSucceeds(setDoc(doc(alice, 'artists/newArtist'), artistData({ id: 'newArtist' })));

  await assertFails(setDoc(doc(alice, 'artists/stolen'), artistData({
    id: 'stolen',
    ownerId: 'bob',
  })));

  await assertFails(setDoc(doc(alice, 'artists/coined'), artistData({
    id: 'coined',
    pumpFun: {
      mint: 'MintAddress111',
      url: 'https://pump.fun/coin',
      symbol: 'NOVA',
      launchedAt: now,
      creatorWallet: 'Wallet1111111111111111111111111111111111',
    },
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
  await assertSucceeds(updateDoc(ref, {
    name: 'Nova Two',
    nameLowercase: 'nova two',
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
});

test('name search is allowed and an unbounded artist list is not', async () => {
  await seedCatalog();
  const anon = dbFor(null);
  await assertSucceeds(getDocs(query(
    collection(anon, 'artists'),
    where('nameLowercase', '==', 'nova'),
  )));
  await assertFails(getDocs(collection(anon, 'artists')));
  await assertFails(getDocs(query(collection(anon, 'artists'), where('deletedAt', '==', null))));
});

test('owner can create a song for their artist only, with no cover or token fields set', async () => {
  await seedCatalog();
  const alice = dbFor('alice');
  await assertSucceeds(setDoc(doc(alice, 'songs/song2'), songData({ id: 'song2', title: 'Second' })));
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
  await assertSucceeds(updateDoc(ref, { deletedAt: now, updatedAt: now }));
  await assertFails(updateDoc(ref, { ownerId: 'bob' }));
  await assertFails(updateDoc(ref, { coverPosterUrl: 'https://cdn.example/cover.jpg' }));
  await assertFails(updateDoc(ref, { albumCoverPath: 'https://cdn.example/legacy.jpg' }));
  await assertFails(updateDoc(ref, { tokenMintAddress: 'MintAddress111', updatedAt: now }));
  await assertFails(updateDoc(doc(dbFor(null), 'songs/song1'), { title: 'Pwned' }));
  await assertFails(updateDoc(doc(dbFor('bob'), 'songs/song1'), { isPublic: false }));
});

test('anyone can increment playCount by one and cannot set it', async () => {
  await seedCatalog();
  const anon = dbFor(null);
  await assertSucceeds(updateDoc(doc(anon, 'songs/song1'), { playCount: increment(1) }));
  await assertFails(updateDoc(doc(anon, 'songs/song1'), { playCount: 100 }));
  await assertFails(updateDoc(doc(anon, 'songs/song1'), { playCount: increment(1), title: 'Nope' }));
});

test('missing playCount can be bumped from absent to 1', async () => {
  await seed(async (db) => {
    const data = songData();
    delete data.playCount;
    await setDoc(doc(db, 'songs/song1'), data);
  });
  await assertSucceeds(updateDoc(doc(dbFor(null), 'songs/song1'), { playCount: increment(1) }));
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
  await assertFails(updateDoc(doc(alice, 'generations/gen1'), { status: 'completed', completedAt: now }));
});

test('owner can change isPrimary and cannot write audioURL', async () => {
  await seedCatalog();
  const alice = dbFor('alice');
  await assertSucceeds(updateDoc(doc(alice, 'songVersions/ver1'), { isPrimary: false }));
  await assertFails(updateDoc(doc(alice, 'songVersions/ver1'), {
    audioURL: 'https://cdn.example/audio.mp3',
  }));
  await assertFails(updateDoc(doc(dbFor('bob'), 'songVersions/ver1'), { isPrimary: false }));
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

test('users can create and update only their own profile, not their email', async () => {
  const bob = dbFor('bob');
  await assertSucceeds(setDoc(doc(bob, 'users/bob'), {
    email: 'bob@example.com',
    displayName: 'Bob',
    photoURL: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }));
  await assertSucceeds(updateDoc(doc(bob, 'users/bob'), {
    displayName: 'Bobby',
    updatedAt: now,
  }));
  await assertSucceeds(updateDoc(doc(bob, 'users/bob'), {
    solanaWalletAddress: 'Wallet1111111111111111111111111111111111',
    updatedAt: now,
  }));
  await assertFails(updateDoc(doc(bob, 'users/bob'), { email: 'eve@example.com' }));
  await assertFails(setDoc(doc(bob, 'users/alice'), {
    email: 'bob@example.com',
    displayName: 'Not Alice',
    deletedAt: null,
  }));
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

test('launched-coin lookup by mint is allowed', async () => {
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
  });
  await assertSucceeds(getDocs(query(
    collection(dbFor(null), 'artists'),
    where('pumpFun.mint', 'in', ['MintAddress111']),
  )));
});

test('catch-all denies unknown collections', async () => {
  await assertFails(getDoc(doc(dbFor(null), 'secrets/one')));
  await assertFails(setDoc(doc(dbFor('alice'), 'secrets/one'), { leak: true }));
});
