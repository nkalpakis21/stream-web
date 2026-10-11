/**
 * HTTP status for not-found routes.
 * Run under the Firestore emulator:
 *   firebase emulators:exec --only firestore --project demo-stream-http -- node scripts/http-status.mjs
 *
 * loading.tsx above a route makes Next stream a 200 before notFound().
 * These requests go through next start so that bug fails the assertions.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const PROJECT = 'demo-stream-http';
const PORT = 3456;
const BASE = `http://127.0.0.1:${PORT}`;

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) {
  console.error('FIRESTORE_EMULATOR_HOST is not set. Run via firebase emulators:exec.');
  process.exit(1);
}

const publicEnv = {
  ...process.env,
  FIRESTORE_EMULATOR_HOST: HOST,
  GCLOUD_PROJECT: PROJECT,
  GOOGLE_CLOUD_PROJECT: PROJECT,
  NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${PROJECT}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${PROJECT}.appspot.com`,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '0',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:0:web:demo',
  NEXT_TELEMETRY_DISABLED: '1',
};

function artistDoc(id, name, isPublic) {
  const now = admin.firestore.Timestamp.fromDate(new Date('2026-01-15T00:00:00Z'));
  return {
    id,
    ownerId: 'owner-alice',
    name,
    nameLowercase: name.toLowerCase(),
    avatarURL: null,
    styleDNA: {
      genres: [],
      moods: [],
      influences: [],
      tempoRange: { min: 60, max: 180 },
    },
    lore: `${name} lore`,
    vocalIdentity: null,
    isPublic,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    currentVersionId: `${id}-v1`,
    pumpFun: null,
  };
}

function songDoc(id, title, { isPublic, deleted, artistId }) {
  const now = admin.firestore.Timestamp.fromDate(new Date('2026-02-01T00:00:00Z'));
  return {
    id,
    ownerId: 'owner-alice',
    artistId,
    artistVersionId: `${artistId}-v1`,
    title,
    isPublic,
    createdAt: now,
    updatedAt: now,
    deletedAt: deleted ? now : null,
    currentVersionId: `${id}-v1`,
    parentSongId: null,
    collaborationType: null,
    albumCoverPath: null,
    albumCoverThumbnail: null,
    coverPosterUrl:
      id === 'song-public' ? 'https://example.com/cover.jpg' : null,
    coverVideoUrl: null,
    coverMotionStatus: null,
    playCount: 3,
  };
}

function versionDoc(songId) {
  const now = admin.firestore.Timestamp.fromDate(new Date('2026-02-01T00:00:00Z'));
  return {
    id: `${songId}-v1`,
    songId,
    versionNumber: 1,
    title: songId,
    createdBy: 'owner-alice',
    createdAt: now,
    parentVersionId: null,
    audioURL: 'https://example.com/audio.mp3',
    providerOutputId: null,
    isPrimary: true,
  };
}

async function seed() {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT });
  }
  const db = admin.firestore();
  const batch = db.batch();
  batch.set(db.collection('artists').doc('artist-public'), artistDoc('artist-public', 'Public Nova', true));
  batch.set(db.collection('artists').doc('artist-private'), artistDoc('artist-private', 'Hidden Band', false));
  batch.set(
    db.collection('songs').doc('song-public'),
    songDoc('song-public', 'Public Signal', { isPublic: true, deleted: false, artistId: 'artist-public' })
  );
  batch.set(
    db.collection('songs').doc('song-deleted'),
    songDoc('song-deleted', 'Gone Track', { isPublic: true, deleted: true, artistId: 'artist-public' })
  );
  batch.set(
    db.collection('songs').doc('song-private'),
    songDoc('song-private', 'Seed Private Song', { isPublic: false, deleted: false, artistId: 'artist-private' })
  );
  for (const id of ['song-public', 'song-deleted', 'song-private']) {
    batch.set(db.collection('songVersions').doc(`${id}-v1`), versionDoc(id));
  }
  await batch.commit();
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: publicEnv, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}`));
    });
  });
}

async function waitForServer() {
  const deadline = Date.now() + 90_000;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/`, { redirect: 'manual' });
      if (res.status > 0) {
        await res.arrayBuffer().catch(() => {});
        return;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`next start did not become ready (${lastError})`);
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function get(path, cookie) {
  const headers = cookie ? { cookie: `ss_viewer=${cookie}` } : undefined;
  const res = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await res.text();
  return { status: res.status, raw, visible: visibleText(raw) };
}

/**
 * Auth emulator ID token. verifyIdToken on the Next server accepts it when
 * FIREBASE_AUTH_EMULATOR_HOST is set. The uid is fixed so the song ownerId matches.
 */
async function idTokenFor(uid) {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT });
  }
  try {
    await admin.auth().createUser({ uid });
  } catch (error) {
    if (error?.code !== 'auth/uid-already-exists') throw error;
  }
  const custom = await admin.auth().createCustomToken(uid);
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const res = await fetch(
    `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    }
  );
  if (!res.ok) {
    throw new Error(`auth emulator token for ${uid} failed: ${await res.text()}`);
  }
  const body = await res.json();
  if (!body.idToken) throw new Error(`auth emulator returned no idToken for ${uid}`);
  return body.idToken;
}

function assertCase(result, expected) {
  const problems = [];
  if (result.status !== expected.status) {
    problems.push(`status ${result.status} !== ${expected.status}`);
  }
  // notFound() copy is in the flight payload. The same payload also embeds the
  // segment not-found component on successful responses, so exclusions use the
  // visible document only.
  if (expected.includes && !result.raw.includes(expected.includes)) {
    problems.push(`body missing ${JSON.stringify(expected.includes)}`);
  }
  if (expected.visibleIncludes && !result.visible.includes(expected.visibleIncludes)) {
    problems.push(`visible page missing ${JSON.stringify(expected.visibleIncludes)}`);
  }
  if (expected.rawIncludes && !result.raw.includes(expected.rawIncludes)) {
    problems.push(`rendered face missing ${JSON.stringify(expected.rawIncludes)}`);
  }
  if (expected.excludes && result.visible.includes(expected.excludes)) {
    problems.push(`body leaked ${JSON.stringify(expected.excludes)}`);
  }
  if (expected.rawExcludes && result.raw.includes(expected.rawExcludes)) {
    problems.push(`raw leaked ${JSON.stringify(expected.rawExcludes)}`);
  }
  if (expected.headExcludes) {
    const headEnd = result.raw.toLowerCase().indexOf('</head>');
    const head = headEnd === -1 ? result.raw : result.raw.slice(0, headEnd);
    if (head.includes(expected.headExcludes)) {
      problems.push(`meta leaked ${JSON.stringify(expected.headExcludes)}`);
    }
  }
  if (result.status === 200 && result.raw.includes('id="__next_error__"')) {
    problems.push('successful response rendered the not-found error shell');
  }
  return problems;
}

async function main() {
  await seed();
  // Admin can read this private song (rules cannot block it). The page must
  // 404 from its own isPublic/owner check, not from a permission-denied read.
  const seeded = await admin.firestore().collection('songs').doc('song-private').get();
  if (!seeded.exists || seeded.get('isPublic') !== false) {
    throw new Error('private song seed was not readable');
  }
  if (seeded.get('title') !== 'Seed Private Song') {
    throw new Error('private song seed title drifted');
  }
  const ownerToken = await idTokenFor('owner-alice');
  const strangerToken = await idTokenFor('owner-bob');
  await run('pnpm', ['exec', 'next', 'build']);

  const server = spawn('pnpm', ['exec', 'next', 'start', '-H', '127.0.0.1', '-p', String(PORT)], {
    env: publicEnv,
    stdio: 'inherit',
    detached: true,
  });

  const cases = [
    {
      path: '/artists/artist-private',
      status: 404,
      includes: "This artist isn't on Streamstar.",
      excludes: 'Hidden Band',
    },
    {
      path: '/artists/artist-missing',
      status: 404,
      includes: "This artist isn't on Streamstar.",
    },
    {
      path: '/artists/artist-public',
      status: 200,
      includes: 'Public Nova',
      visibleIncludes: 'Songs',
      rawIncludes: 'https://example.com/cover.jpg',
      excludes: "This artist isn't on Streamstar.",
    },
    {
      path: '/songs/song-missing',
      status: 404,
      includes: "This song isn't on Streamstar.",
    },
    {
      path: '/songs/song-deleted',
      status: 404,
      includes: "This song isn't on Streamstar.",
      excludes: 'Gone Track',
      rawExcludes: 'Gone Track',
    },
    {
      path: '/songs/song-private',
      status: 404,
      includes: "This song isn't on Streamstar.",
      excludes: 'Seed Private Song',
      rawExcludes: 'Seed Private Song',
    },
    {
      path: '/songs/song-private',
      status: 404,
      cookie: strangerToken,
      includes: "This song isn't on Streamstar.",
      excludes: 'Seed Private Song',
      rawExcludes: 'Seed Private Song',
    },
    {
      path: '/songs/song-private',
      status: 200,
      cookie: ownerToken,
      visibleIncludes: 'Seed Private Song',
      headExcludes: 'Seed Private Song',
      excludes: "This song isn't on Streamstar.",
    },
    {
      path: '/api/songs/song-private/token-metadata',
      status: 404,
      rawExcludes: 'Seed Private Song',
    },
    {
      path: '/api/songs/song-private/token-metadata',
      status: 404,
      cookie: strangerToken,
      rawExcludes: 'Seed Private Song',
    },
    {
      path: '/songs/song-public',
      status: 200,
      includes: 'Public Signal',
      excludes: "This song isn't on Streamstar.",
    },
    { path: '/', status: 200, includes: 'Heat' },
    { path: '/discover', status: 200, includes: 'Discover' },
    { path: '/chat', status: 200, includes: 'Chat' },
    { path: '/dashboard', status: 200, includes: 'Studio' },
  ];

  let failed = 0;
  try {
    await waitForServer();
    for (const expected of cases) {
      const result = await get(expected.path, expected.cookie);
      const problems = assertCase(result, expected);
      const mark = problems.length === 0 ? 'ok' : 'FAIL';
      console.log(`${mark} ${result.status} ${expected.path}${problems.length ? ` — ${problems.join('; ')}` : ''}`);
      if (problems.length) failed += 1;
    }
  } finally {
    if (server.pid) {
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {
        server.kill('SIGTERM');
      }
    }
    await Promise.race([
      once(server, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  }

  if (failed > 0) {
    console.error(`${failed} HTTP status check(s) failed`);
    process.exit(1);
  }
  console.log('HTTP status checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
